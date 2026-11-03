-- =============================================================================
-- PermiTrack 0002: authorization helpers, validation, notifications, audit
-- =============================================================================
-- Every helper is SECURITY DEFINER with a pinned search_path. They never trust
-- client supplied identity: the acting user is always derived from auth.uid().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Identity / role helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_actor()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.require_active_user()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = 'PT401';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then
    raise exception 'Your account is inactive. Contact an administrator.' using errcode = 'PT403';
  end if;
  return v_uid;
end;
$$;

create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.require_active_user();
begin
  if not exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = v_uid
      and r.name = 'admin'
      and ur.is_active
      and (ur.starts_at is null or ur.starts_at <= now())
      and (ur.ends_at is null or ur.ends_at > now())
  ) then
    raise exception 'Administrator privileges are required.' using errcode = 'PT403';
  end if;
  return v_uid;
end;
$$;

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user_id
      and p.is_active
      and r.name = 'admin'
      and ur.is_active
      and (ur.starts_at is null or ur.starts_at <= now())
      and (ur.ends_at is null or ur.ends_at > now())
  );
$$;

create or replace function public.has_role(p_role text, p_department_id uuid default null, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user_id
      and p.is_active
      and r.name = p_role
      and ur.is_active
      and (ur.starts_at is null or ur.starts_at <= now())
      and (ur.ends_at is null or ur.ends_at > now())
      and (p_department_id is null or ur.department_id is null or ur.department_id = p_department_id)
  );
$$;

-- First active, in-window holder of a role. Department scoped assignments win
-- over university-wide ones. Returns NULL when nobody qualifies.
create or replace function public.find_active_user_with_role(p_role_id uuid, p_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ur.user_id
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.role_id = p_role_id
    and ur.is_active
    and p.is_active
    and (ur.starts_at is null or ur.starts_at <= now())
    and (ur.ends_at is null or ur.ends_at > now())
    and (p_department_id is null or ur.department_id is null or ur.department_id = p_department_id)
  order by (ur.department_id is not null) desc, ur.created_at asc, ur.id asc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Project / request visibility
-- ---------------------------------------------------------------------------

create or replace function public.is_project_member(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = p_user_id
  );
$$;

create or replace function public.can_view_project(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects pr
    left join public.departments d on d.id = pr.department_id
    where pr.id = p_project_id
      and (
        pr.created_by = p_user_id
        or pr.faculty_guide_id = p_user_id
        or d.head_user_id = p_user_id
        or public.is_admin(p_user_id)
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = pr.id and pm.user_id = p_user_id
        )
      )
      and exists (select 1 from public.profiles p where p.id = p_user_id and p.is_active)
  );
$$;

-- Central read authorization for a permission request. Used by RLS, storage
-- policies, API routes and the workflow engine.
create or replace function public.can_view_request(p_request_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.permission_requests r
    join public.projects pr on pr.id = r.project_id
    left join public.departments d on d.id = pr.department_id
    where r.id = p_request_id
      and exists (select 1 from public.profiles p where p.id = p_user_id and p.is_active)
      and (
        public.is_admin(p_user_id)
        or r.created_by = p_user_id
        or pr.created_by = p_user_id
        or pr.faculty_guide_id = p_user_id
        or d.head_user_id = p_user_id
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = r.project_id and pm.user_id = p_user_id
        )
        or exists (
          select 1 from public.request_stage_states ss
          where ss.request_id = r.id
            and (ss.assigned_approver_id = p_user_id or ss.delegated_from_user_id = p_user_id)
        )
        or exists (
          select 1 from public.approval_actions aa
          where aa.request_id = r.id and aa.actor_id = p_user_id
        )
        or exists (
          select 1
          from public.user_roles ur
          join public.roles ro on ro.id = ur.role_id
          where ur.user_id = p_user_id
            and ur.is_active
            and ro.name = 'department_head'
            and ur.department_id = pr.department_id
            and (ur.starts_at is null or ur.starts_at <= now())
            and (ur.ends_at is null or ur.ends_at > now())
        )
      )
  );
$$;

-- Internal comments / notes are for staff only.
create or replace function public.can_view_internal(p_request_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin(p_user_id) or exists (
    select 1
    from public.permission_requests r
    join public.projects pr on pr.id = r.project_id
    where r.id = p_request_id
      and (
        pr.faculty_guide_id = p_user_id
        or exists (
          select 1 from public.request_stage_states ss
          where ss.request_id = r.id
            and (ss.assigned_approver_id = p_user_id or ss.delegated_from_user_id = p_user_id)
        )
        or exists (
          select 1 from public.approval_actions aa
          where aa.request_id = r.id
            and aa.actor_id = p_user_id
            and aa.action in (
              'APPROVE_STAGE', 'REJECT_REQUEST', 'REQUEST_CHANGES', 'ASK_QUERY',
              'EDIT_REQUEST_BY_AUTHORITY', 'FORWARD_STAGE', 'DELEGATE_STAGE',
              'ISSUE_FINAL_PERMISSION'
            )
        )
      )
  );
$$;

create or replace function public.is_request_creator(p_request_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.permission_requests r
    where r.id = p_request_id and r.created_by = p_user_id
  );
$$;

-- Students (creator or OWNER/EDITOR team member) may edit while a request is a
-- draft or while changes were requested.
create or replace function public.can_edit_request_as_student(p_request_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.permission_requests r
    join public.profiles p on p.id = p_user_id
    where r.id = p_request_id
      and p.is_active
      and r.status in ('DRAFT', 'CHANGES_REQUESTED')
      and (
        r.created_by = p_user_id
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = r.project_id
            and pm.user_id = p_user_id
            and pm.role in ('OWNER', 'EDITOR')
        )
      )
  );
$$;

create or replace function public.can_upload_documents(p_request_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.permission_requests r
    join public.profiles p on p.id = p_user_id
    where r.id = p_request_id
      and p.is_active
      and r.status in ('DRAFT', 'CHANGES_REQUESTED', 'UNDER_REVIEW')
      and (
        r.created_by = p_user_id
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = r.project_id
            and pm.user_id = p_user_id
            and pm.role in ('OWNER', 'EDITOR')
        )
      )
  );
$$;

-- Only the currently assigned approver (or an admin) can act on a stage.
create or replace function public.can_act_on_stage(p_stage_state_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.request_stage_states ss
    join public.permission_requests r on r.id = ss.request_id
    join public.profiles p on p.id = p_user_id
    where ss.id = p_stage_state_id
      and p.is_active
      and ss.status = 'ACTIVE'
      and r.status in ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED')
      and (ss.assigned_approver_id = p_user_id or public.is_admin(p_user_id))
  );
$$;

create or replace function public.can_view_profile(p_profile_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_profile_id = p_user_id
    or public.is_admin(p_user_id)
    or exists (
      select 1
      from public.project_members a
      join public.project_members b on b.project_id = a.project_id
      where a.user_id = p_user_id and b.user_id = p_profile_id
    )
    or exists (
      select 1 from public.projects pr
      where pr.faculty_guide_id = p_profile_id
        and public.can_view_project(pr.id, p_user_id)
    )
    or exists (
      select 1 from public.projects pr
      where pr.created_by = p_profile_id
        and public.can_view_project(pr.id, p_user_id)
    )
    or exists (
      select 1 from public.project_members pm
      where pm.user_id = p_profile_id
        and public.can_view_project(pm.project_id, p_user_id)
    )
    or exists (
      select 1 from public.permission_requests r
      where r.created_by = p_profile_id
        and public.can_view_request(r.id, p_user_id)
    )
    or exists (
      select 1 from public.request_stage_states ss
      where ss.assigned_approver_id = p_profile_id
        and public.can_view_request(ss.request_id, p_user_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Department scoping and approver resolution
-- ---------------------------------------------------------------------------

create or replace function public.scope_department(p_project_department uuid, p_scope text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive chain as (
    select d.id, d.parent_id, 0 as depth
    from public.departments d
    where d.id = p_project_department
    union all
    select parent.id, parent.parent_id, chain.depth + 1
    from public.departments parent
    join chain on parent.id = chain.parent_id
  )
  select case p_scope
    when 'PARENT_DEPARTMENT' then coalesce(
      (select parent_id from public.departments where id = p_project_department),
      p_project_department
    )
    when 'ROOT_DEPARTMENT' then (
      select id from chain order by depth desc limit 1
    )
    else p_project_department
  end;
$$;

-- Resolve who should approve a stage. Returns NULL when no active approver can
-- be found; callers must treat that as a configuration error (and alert admins).
create or replace function public.resolve_approver(p_request_id uuid, p_stage_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests;
  v_stage public.workflow_stages;
  v_project public.projects;
  v_scope_dept uuid;
  v_candidate uuid;
  v_role_id uuid;
begin
  select * into v_request from public.permission_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'Request not found.' using errcode = 'PT404';
  end if;

  select * into v_stage from public.workflow_stages where id = p_stage_id;
  if v_stage.id is null then
    raise exception 'Workflow stage not found.' using errcode = 'PT404';
  end if;

  select * into v_project from public.projects where id = v_request.project_id;
  if v_project.id is null then
    raise exception 'Project not found.' using errcode = 'PT404';
  end if;

  v_scope_dept := public.scope_department(v_project.department_id, v_stage.department_scope);

  case v_stage.approver_type
    when 'PROJECT_FACULTY_GUIDE' then
      v_candidate := v_project.faculty_guide_id;

    when 'DEPARTMENT_HEAD' then
      select d.head_user_id into v_candidate from public.departments d where d.id = v_scope_dept;

    when 'USER' then
      v_candidate := v_stage.approver_user_id;

    when 'ROLE' then
      v_candidate := public.find_active_user_with_role(v_stage.approver_role_id, v_scope_dept);

    when 'LAB_MANAGER' then
      select id into v_role_id from public.roles where name = 'lab_manager';
      v_candidate := public.find_active_user_with_role(v_role_id, v_scope_dept);

    when 'DEAN' then
      select id into v_role_id from public.roles where name = 'dean';
      v_candidate := public.find_active_user_with_role(v_role_id, v_scope_dept);

    when 'CUSTOM' then
      v_candidate := coalesce(
        v_stage.approver_user_id,
        public.find_active_user_with_role(v_stage.approver_role_id, v_scope_dept)
      );

    else
      v_candidate := null;
  end case;

  -- An inactive or deleted user cannot receive work.
  if v_candidate is not null and not exists (
    select 1 from public.profiles p where p.id = v_candidate and p.is_active
  ) then
    v_candidate := null;
  end if;

  -- Substitute: fall back to an active department head for role based stages
  -- when the configured role has no holder in scope.
  if v_candidate is null and v_stage.approver_type in ('ROLE', 'LAB_MANAGER', 'DEAN') then
    select d.head_user_id into v_candidate
    from public.departments d
    where d.id = v_scope_dept
      and d.head_user_id is not null
      and exists (select 1 from public.profiles p where p.id = d.head_user_id and p.is_active);
  end if;

  return v_candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dynamic form validation (server-side mirror of the Zod schema)
-- ---------------------------------------------------------------------------

create or replace function public.field_is_visible(p_field jsonb, p_form_data jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_field -> 'visible_if' is null or p_field -> 'visible_if' = 'null'::jsonb then
    return true;
  end if;
  return public.evaluate_condition(p_field -> 'visible_if', p_form_data);
end;
$$;

create or replace function public.evaluate_condition(p_condition jsonb, p_form_data jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_item jsonb;
begin
  if p_condition is null or p_condition = 'null'::jsonb or p_condition = '{}'::jsonb then
    return true;
  end if;

  if jsonb_typeof(p_condition -> 'all') = 'array' then
    for v_item in select jsonb_array_elements(p_condition -> 'all') loop
      if not public.evaluate_condition(v_item, p_form_data) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  if jsonb_typeof(p_condition -> 'any') = 'array' then
    for v_item in select jsonb_array_elements(p_condition -> 'any') loop
      if public.evaluate_condition(v_item, p_form_data) then
        return true;
      end if;
    end loop;
    return false;
  end if;

  if p_condition ? 'exists' then
    if coalesce((p_condition ->> 'exists')::boolean, true) then
      return p_form_data -> (p_condition ->> 'field') is not null
        and p_form_data ->> (p_condition ->> 'field') <> '';
    end if;
    return p_form_data -> (p_condition ->> 'field') is null
      or p_form_data ->> (p_condition ->> 'field') = '';
  end if;

  if p_condition ? 'not_equals' then
    return p_form_data -> (p_condition ->> 'field') is distinct from (p_condition -> 'not_equals');
  end if;

  if jsonb_typeof(p_condition -> 'in') = 'array' then
    return exists (
      select 1 from jsonb_array_elements(p_condition -> 'in') opt
      where opt = p_form_data -> (p_condition ->> 'field')
    );
  end if;

  if p_condition ? 'equals' then
    return p_form_data -> (p_condition ->> 'field') = (p_condition -> 'equals');
  end if;

  return true;
end;
$$;

-- Raises PT422 with a human readable message when the payload is invalid.
create or replace function public.validate_form_data(p_permission_type_id uuid, p_form_data jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_schema jsonb;
  v_field jsonb;
  v_key text;
  v_type text;
  v_label text;
  v_value jsonb;
  v_required boolean;
  v_options jsonb;
begin
  select form_schema into v_schema from public.permission_types where id = p_permission_type_id;
  if v_schema is null then
    raise exception 'Permission type not found.' using errcode = 'PT404';
  end if;

  if p_form_data is null or jsonb_typeof(p_form_data) <> 'object' then
    raise exception 'Form data must be an object.' using errcode = 'PT422';
  end if;

  for v_field in select * from jsonb_array_elements(coalesce(v_schema -> 'fields', '[]'::jsonb)) loop
    v_key := v_field ->> 'key';
    if v_key is null or v_key = '' then
      continue;
    end if;
    if not public.field_is_visible(v_field, p_form_data) then
      continue;
    end if;

    v_type := coalesce(v_field ->> 'type', 'text');
    v_label := coalesce(v_field ->> 'label', v_key);
    v_value := p_form_data -> v_key;
    v_required := coalesce((v_field ->> 'required')::boolean, false);

    if v_value is null or v_value = 'null'::jsonb
       or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '') then
      if v_required then
        raise exception 'Field "%" is required.', v_label using errcode = 'PT422';
      end if;
      continue;
    end if;

    case v_type
      when 'text', 'textarea', 'email' then
        if jsonb_typeof(v_value) <> 'string' then
          raise exception 'Field "%" must be text.', v_label using errcode = 'PT422';
        end if;
        if v_type = 'email' and (v_value #>> '{}') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
          raise exception 'Field "%" must be a valid email address.', v_label using errcode = 'PT422';
        end if;
      when 'date', 'datetime' then
        if jsonb_typeof(v_value) <> 'string' then
          raise exception 'Field "%" must be a date.', v_label using errcode = 'PT422';
        end if;
        begin
          perform (v_value #>> '{}')::timestamptz;
        exception when others then
          raise exception 'Field "%" must be a valid date.', v_label using errcode = 'PT422';
        end;
      when 'number' then
        if jsonb_typeof(v_value) <> 'number' then
          raise exception 'Field "%" must be a number.', v_label using errcode = 'PT422';
        end if;
      when 'checkbox' then
        if jsonb_typeof(v_value) <> 'boolean' then
          raise exception 'Field "%" must be true or false.', v_label using errcode = 'PT422';
        end if;
      when 'select' then
        v_options := coalesce(v_field -> 'options', '[]'::jsonb);
        if not exists (
          select 1 from jsonb_array_elements(v_options) opt
          where opt ->> 'value' = v_value #>> '{}'
             or opt = v_value
        ) then
          raise exception 'Field "%" has an invalid selection.', v_label using errcode = 'PT422';
        end if;
      when 'multiselect' then
        if jsonb_typeof(v_value) <> 'array' then
          raise exception 'Field "%" must be a list.', v_label using errcode = 'PT422';
        end if;
        v_options := coalesce(v_field -> 'options', '[]'::jsonb);
        if exists (
          select 1 from jsonb_array_elements(v_value) val
          where not exists (
            select 1 from jsonb_array_elements(v_options) opt
            where opt ->> 'value' = val #>> '{}' or opt = val
          )
        ) then
          raise exception 'Field "%" contains an invalid selection.', v_label using errcode = 'PT422';
        end if;
      else
        null;
    end case;
  end loop;
end;
$$;

create or replace function public.material_fields(p_permission_type_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(f ->> 'key'), '{}')
  from public.permission_types pt
  cross join lateral jsonb_array_elements(coalesce(pt.form_schema -> 'fields', '[]'::jsonb)) f
  where pt.id = p_permission_type_id
    and coalesce((f ->> 'material')::boolean, false);
$$;

-- ---------------------------------------------------------------------------
-- Audit + notifications
-- ---------------------------------------------------------------------------

create or replace function public.write_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip text;
  v_ua text;
  v_headers text;
begin
  -- PostgREST exposes request headers; ignore failures outside PostgREST.
  begin
    v_headers := current_setting('request.headers', true);
    if v_headers is not null and v_headers <> '' then
      v_ip := nullif(split_part(coalesce((v_headers::jsonb ->> 'x-forwarded-for'), ''), ',', 1), '');
      v_ua := left(coalesce(v_headers::jsonb ->> 'user-agent', ''), 500);
    end if;
  exception when others then
    v_ip := null;
    v_ua := null;
  end;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb), v_ip, v_ua);
end;
$$;

create or replace function public.notify_user(
  p_user_id uuid,
  p_request_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and is_active) then
    return null;
  end if;

  insert into public.notifications (user_id, request_id, type, title, body, link)
  values (p_user_id, p_request_id, p_type, p_title, p_body, p_link)
  returning id into v_id;

  return v_id;
end;
$$;

-- Notify every active member of the project team except the actor.
create or replace function public.notify_project_team(
  p_request_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_actor_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_link text := '/requests/' || p_request_id::text;
  v_user uuid;
begin
  select project_id into v_project_id from public.permission_requests where id = p_request_id;
  if v_project_id is null then
    return;
  end if;

  for v_user in
    select distinct u from (
      select r.created_by as u
      from public.permission_requests r where r.id = p_request_id
      union
      select pm.user_id as u
      from public.project_members pm where pm.project_id = v_project_id
    ) recipients
    where u is not null and u <> coalesce(p_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    perform public.notify_user(v_user, p_request_id, p_type, p_title, p_body, v_link);
  end loop;
end;
$$;

create or replace function public.notify_admins(
  p_request_id uuid,
  p_type text,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_link text := case when p_request_id is null then '/admin' else '/requests/' || p_request_id::text end;
begin
  for v_user in
    select distinct ur.user_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where r.name = 'admin'
      and ur.is_active
      and p.is_active
      and (ur.starts_at is null or ur.starts_at <= now())
      and (ur.ends_at is null or ur.ends_at > now())
  loop
    perform public.notify_user(v_user, p_request_id, p_type, p_title, p_body, v_link);
  end loop;
end;
$$;
