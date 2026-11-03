-- =============================================================================
-- PermiTrack 0004: projects, administration, analytics
-- =============================================================================

create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create or replace function public.api_create_project(
  p_title text,
  p_description text,
  p_department_id uuid,
  p_category text default null,
  p_faculty_guide_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_id uuid;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'A project title is required.' using errcode = 'PT422';
  end if;

  if not exists (select 1 from public.departments where id = p_department_id) then
    raise exception 'Department not found.' using errcode = 'PT404';
  end if;

  if p_faculty_guide_id is not null then
    if not exists (select 1 from public.profiles where id = p_faculty_guide_id and is_active) then
      raise exception 'The selected faculty guide is not an active user.' using errcode = 'PT422';
    end if;
    if not public.has_role('faculty_guide', null, p_faculty_guide_id) then
      raise exception 'The selected user is not a faculty guide.' using errcode = 'PT422';
    end if;
  end if;

  insert into public.projects (
    title, description, department_id, created_by, faculty_guide_id, category
  ) values (
    btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_department_id,
    v_actor, p_faculty_guide_id, nullif(btrim(coalesce(p_category, '')), '')
  )
  returning id into v_id;

  insert into public.project_members (project_id, user_id, role)
  values (v_id, v_actor, 'OWNER')
  on conflict (project_id, user_id) do update set role = 'OWNER';

  if p_faculty_guide_id is not null and p_faculty_guide_id <> v_actor then
    insert into public.project_members (project_id, user_id, role)
    values (v_id, p_faculty_guide_id, 'FACULTY_GUIDE')
    on conflict (project_id, user_id) do update set role = 'FACULTY_GUIDE';
  end if;

  perform public.write_audit(v_actor, 'CREATE_PROJECT', 'project', v_id, jsonb_build_object(
    'title', p_title, 'department_id', p_department_id, 'faculty_guide_id', p_faculty_guide_id
  ));

  return v_id;
end;
$$;

create or replace function public.api_update_project(
  p_project_id uuid,
  p_title text,
  p_description text,
  p_category text default null,
  p_faculty_guide_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_project public.projects;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if v_project.id is null then
    raise exception 'Project not found.' using errcode = 'PT404';
  end if;

  if not (v_project.created_by = v_actor or v_project.faculty_guide_id = v_actor or public.is_admin(v_actor)) then
    raise exception 'You cannot edit this project.' using errcode = 'PT403';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'A project title is required.' using errcode = 'PT422';
  end if;

  if p_faculty_guide_id is not null then
    if not exists (select 1 from public.profiles where id = p_faculty_guide_id and is_active) then
      raise exception 'The selected faculty guide is not an active user.' using errcode = 'PT422';
    end if;
    if not public.has_role('faculty_guide', null, p_faculty_guide_id) then
      raise exception 'The selected user is not a faculty guide.' using errcode = 'PT422';
    end if;
  end if;

  update public.projects
  set title = btrim(p_title),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      category = nullif(btrim(coalesce(p_category, '')), ''),
      faculty_guide_id = p_faculty_guide_id
  where id = p_project_id;

  if p_faculty_guide_id is not null then
    insert into public.project_members (project_id, user_id, role)
    values (p_project_id, p_faculty_guide_id, 'FACULTY_GUIDE')
    on conflict (project_id, user_id) do update set role = 'FACULTY_GUIDE';
  end if;

  perform public.write_audit(v_actor, 'UPDATE_PROJECT', 'project', p_project_id, jsonb_build_object(
    'title', p_title, 'faculty_guide_id', p_faculty_guide_id
  ));
end;
$$;

create or replace function public.api_add_project_member(
  p_project_id uuid,
  p_user_id uuid,
  p_role text default 'MEMBER'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_project public.projects;
  v_role text := upper(coalesce(p_role, 'MEMBER'));
begin
  select * into v_project from public.projects where id = p_project_id;
  if v_project.id is null then
    raise exception 'Project not found.' using errcode = 'PT404';
  end if;

  if not (v_project.created_by = v_actor or v_project.faculty_guide_id = v_actor or public.is_admin(v_actor)) then
    raise exception 'You cannot manage this project.' using errcode = 'PT403';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and is_active) then
    raise exception 'The selected user is not active.' using errcode = 'PT422';
  end if;

  if v_role not in ('OWNER', 'EDITOR', 'MEMBER') then
    raise exception 'Invalid member role.' using errcode = 'PT422';
  end if;

  if p_user_id = v_project.faculty_guide_id then
    raise exception 'The faculty guide already supervises this project.' using errcode = 'PT409';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, p_user_id, v_role)
  on conflict (project_id, user_id) do update set role = v_role;

  perform public.notify_user(
    p_user_id, null, 'ADDED_TO_PROJECT', 'Added to a project',
    format('You were added to "%s".', v_project.title), '/projects/' || p_project_id::text
  );

  perform public.write_audit(v_actor, 'ADD_PROJECT_MEMBER', 'project', p_project_id,
    jsonb_build_object('user_id', p_user_id, 'role', v_role));
end;
$$;

create or replace function public.api_remove_project_member(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_project public.projects;
begin
  select * into v_project from public.projects where id = p_project_id;
  if v_project.id is null then
    raise exception 'Project not found.' using errcode = 'PT404';
  end if;

  if not (v_project.created_by = v_actor or v_project.faculty_guide_id = v_actor or public.is_admin(v_actor)) then
    raise exception 'You cannot manage this project.' using errcode = 'PT403';
  end if;

  if p_user_id = v_project.created_by then
    raise exception 'The project owner cannot be removed.' using errcode = 'PT409';
  end if;

  delete from public.project_members where project_id = p_project_id and user_id = p_user_id;

  perform public.write_audit(v_actor, 'REMOVE_PROJECT_MEMBER', 'project', p_project_id,
    jsonb_build_object('user_id', p_user_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Permission type configuration
-- ---------------------------------------------------------------------------

create or replace function public.validate_form_schema(p_schema jsonb)
returns void
language plpgsql
immutable
as $$
declare
  v_field jsonb;
  v_key text;
  v_type text;
  v_keys text[] := '{}';
  v_allowed_types text[] := array[
    'text', 'textarea', 'email', 'date', 'datetime', 'number',
    'select', 'multiselect', 'checkbox'
  ];
begin
  if p_schema is null or jsonb_typeof(p_schema) <> 'object' then
    raise exception 'Form schema must be an object.' using errcode = 'PT422';
  end if;

  if jsonb_typeof(coalesce(p_schema -> 'fields', '[]'::jsonb)) <> 'array' then
    raise exception 'Form schema "fields" must be an array.' using errcode = 'PT422';
  end if;

  for v_field in select * from jsonb_array_elements(coalesce(p_schema -> 'fields', '[]'::jsonb)) loop
    v_key := v_field ->> 'key';
    v_type := coalesce(v_field ->> 'type', 'text');

    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{0,63}$' then
      raise exception 'Field keys must be lower_snake_case (invalid: %).', coalesce(v_key, 'null')
        using errcode = 'PT422';
    end if;

    if v_key = any(v_keys) then
      raise exception 'Duplicate field key "%".', v_key using errcode = 'PT422';
    end if;
    v_keys := array_append(v_keys, v_key);

    if not (v_type = any(v_allowed_types)) then
      raise exception 'Unsupported field type "%" for "%".', v_type, v_key using errcode = 'PT422';
    end if;

    if coalesce(v_field ->> 'label', '') = '' then
      raise exception 'Field "%" needs a label.', v_key using errcode = 'PT422';
    end if;

    if v_type in ('select', 'multiselect') then
      if jsonb_typeof(coalesce(v_field -> 'options', 'null'::jsonb)) <> 'array'
         or jsonb_array_length(v_field -> 'options') = 0 then
        raise exception 'Field "%" needs at least one option.', v_key using errcode = 'PT422';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_field -> 'options') opt
        where coalesce(opt ->> 'value', '') = '' or coalesce(opt ->> 'label', '') = ''
      ) then
        raise exception 'Options for "%" need a value and a label.', v_key using errcode = 'PT422';
      end if;
    end if;

    if v_field ? 'visible_if' and jsonb_typeof(v_field -> 'visible_if') <> 'object' then
      raise exception 'visible_if for "%" must be an object.', v_key using errcode = 'PT422';
    end if;
  end loop;
end;
$$;

create or replace function public.api_admin_save_permission_type(
  p_id uuid,
  p_name text,
  p_description text,
  p_department_id uuid,
  p_form_schema jsonb,
  p_eligibility_rules jsonb default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_id uuid := p_id;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'A permission type name is required.' using errcode = 'PT422';
  end if;

  perform public.validate_form_schema(p_form_schema);

  if p_department_id is not null and not exists (
    select 1 from public.departments where id = p_department_id
  ) then
    raise exception 'Department not found.' using errcode = 'PT404';
  end if;

  if v_id is null then
    insert into public.permission_types (
      name, description, department_id, form_schema, eligibility_rules, is_active
    ) values (
      btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_department_id,
      p_form_schema, p_eligibility_rules, coalesce(p_is_active, true)
    )
    returning id into v_id;
  else
    if not exists (select 1 from public.permission_types where id = v_id) then
      raise exception 'Permission type not found.' using errcode = 'PT404';
    end if;

    update public.permission_types
    set name = btrim(p_name),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        department_id = p_department_id,
        form_schema = p_form_schema,
        eligibility_rules = p_eligibility_rules,
        is_active = coalesce(p_is_active, true)
    where id = v_id;
  end if;

  perform public.write_audit(v_actor, 'SAVE_PERMISSION_TYPE', 'permission_type', v_id, jsonb_build_object(
    'name', p_name, 'is_active', p_is_active, 'department_id', p_department_id
  ));

  return v_id;
end;
$$;

create or replace function public.api_admin_save_document_type(
  p_id uuid,
  p_permission_type_id uuid,
  p_name text,
  p_description text,
  p_is_required boolean default true,
  p_accepted_mime_types text[] default null,
  p_max_size_mb integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_id uuid := p_id;
  v_allowed text[] := array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  v_mimes text[];
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'A document name is required.' using errcode = 'PT422';
  end if;

  if not exists (select 1 from public.permission_types where id = p_permission_type_id) then
    raise exception 'Permission type not found.' using errcode = 'PT404';
  end if;

  v_mimes := coalesce(p_accepted_mime_types, v_allowed);
  if exists (select 1 from unnest(v_mimes) m where not (m = any(v_allowed))) then
    raise exception 'Unsupported accepted MIME type.' using errcode = 'PT422';
  end if;

  if p_max_size_mb is null or p_max_size_mb < 1 or p_max_size_mb > 10 then
    raise exception 'Maximum size must be between 1 and 10 MB.' using errcode = 'PT422';
  end if;

  if v_id is null then
    insert into public.required_document_types (
      permission_type_id, name, description, is_required, accepted_mime_types, max_size_mb
    ) values (
      p_permission_type_id, btrim(p_name), p_description,
      coalesce(p_is_required, true), v_mimes, p_max_size_mb
    )
    returning id into v_id;
  else
    update public.required_document_types
    set permission_type_id = p_permission_type_id,
        name = btrim(p_name),
        description = p_description,
        is_required = coalesce(p_is_required, true),
        accepted_mime_types = v_mimes,
        max_size_mb = p_max_size_mb
    where id = v_id;

    if not found then
      raise exception 'Document type not found.' using errcode = 'PT404';
    end if;
  end if;

  perform public.write_audit(v_actor, 'SAVE_DOCUMENT_TYPE', 'required_document_type', v_id,
    jsonb_build_object('permission_type_id', p_permission_type_id, 'name', p_name));

  return v_id;
end;
$$;

create or replace function public.api_admin_delete_document_type(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
begin
  delete from public.required_document_types where id = p_id;
  perform public.write_audit(v_actor, 'DELETE_DOCUMENT_TYPE', 'required_document_type', p_id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Workflow configuration
-- ---------------------------------------------------------------------------

create or replace function public.engine_insert_stage(
  p_template_id uuid,
  p_stage jsonb,
  p_schema_keys text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sequence integer;
  v_name text := nullif(btrim(coalesce(p_stage ->> 'name', '')), '');
  v_type text := coalesce(p_stage ->> 'approverType', 'CUSTOM');
  v_role uuid := public.try_uuid(p_stage ->> 'approverRoleId');
  v_user uuid := public.try_uuid(p_stage ->> 'approverUserId');
  v_scope text := coalesce(p_stage ->> 'departmentScope', 'PROJECT_DEPARTMENT');
  v_edit text[] := '{}';
  v_invalidate text[] := '{}';
  v_sla integer;
  v_conditions jsonb := p_stage -> 'conditions';
  v_field text;
begin
  v_sequence := coalesce(
    nullif(p_stage ->> 'sequence', '')::integer,
    (select coalesce(max(sequence), 0) + 1 from public.workflow_stages where template_id = p_template_id)
  );

  if v_name is null then
    raise exception 'Every stage needs a name.' using errcode = 'PT422';
  end if;

  if v_type not in ('PROJECT_FACULTY_GUIDE', 'DEPARTMENT_HEAD', 'ROLE', 'USER', 'LAB_MANAGER', 'DEAN', 'CUSTOM') then
    raise exception 'Invalid approver type "%".', v_type using errcode = 'PT422';
  end if;

  if v_scope not in ('PROJECT_DEPARTMENT', 'PARENT_DEPARTMENT', 'ROOT_DEPARTMENT') then
    raise exception 'Invalid department scope.' using errcode = 'PT422';
  end if;

  if v_type = 'ROLE' and v_role is null then
    raise exception 'Stage "%" needs a role.', v_name using errcode = 'PT422';
  end if;

  if v_type = 'USER' and v_user is null then
    raise exception 'Stage "%" needs a user.', v_name using errcode = 'PT422';
  end if;

  if v_role is not null and not exists (select 1 from public.roles where id = v_role) then
    raise exception 'Stage "%" references an unknown role.', v_name using errcode = 'PT422';
  end if;

  if v_user is not null and not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'Stage "%" references an unknown user.', v_name using errcode = 'PT422';
  end if;

  if p_stage ? 'slaHours' and coalesce(p_stage ->> 'slaHours', '') <> '' then
    if (p_stage ->> 'slaHours') !~ '^[0-9]+$' then
      raise exception 'SLA hours must be a positive whole number.' using errcode = 'PT422';
    end if;
    v_sla := (p_stage ->> 'slaHours')::integer;
    if v_sla < 1 or v_sla > 8760 then
      raise exception 'SLA hours must be between 1 and 8760.' using errcode = 'PT422';
    end if;
  end if;

  if p_stage ? 'canEditFields' and jsonb_typeof(p_stage -> 'canEditFields') = 'array' then
    select coalesce(array_agg(value), '{}') into v_edit
    from jsonb_array_elements_text(p_stage -> 'canEditFields');
  end if;

  if p_stage ? 'invalidatesOn' and jsonb_typeof(p_stage -> 'invalidatesOn') = 'array' then
    select coalesce(array_agg(value), '{}') into v_invalidate
    from jsonb_array_elements_text(p_stage -> 'invalidatesOn');
  end if;

  foreach v_field in array v_edit loop
    if p_schema_keys is not null and not (v_field = any(p_schema_keys)) then
      raise exception 'can_edit_fields references unknown field "%".', v_field using errcode = 'PT422';
    end if;
  end loop;

  foreach v_field in array v_invalidate loop
    if p_schema_keys is not null and not (v_field = any(p_schema_keys)) then
      raise exception 'invalidates_on references unknown field "%".', v_field using errcode = 'PT422';
    end if;
  end loop;

  if v_conditions is not null and v_conditions <> 'null'::jsonb
     and jsonb_typeof(v_conditions) <> 'object' then
    raise exception 'Stage conditions must be a JSON object.' using errcode = 'PT422';
  end if;

  insert into public.workflow_stages (
    template_id, sequence, name, approver_type, approver_role_id, approver_user_id,
    department_scope, can_edit_fields, invalidates_on, sla_hours, conditions
  ) values (
    p_template_id, v_sequence, v_name, v_type, v_role, v_user,
    v_scope, coalesce(v_edit, '{}'), coalesce(v_invalidate, '{}'), v_sla,
    case when v_conditions = 'null'::jsonb then null else v_conditions end
  );
end;
$$;

create or replace function public.api_admin_create_workflow_template(
  p_permission_type_id uuid,
  p_name text,
  p_stages jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_version integer;
  v_template_id uuid;
  v_schema_keys text[];
  v_stage jsonb;
begin
  if not exists (select 1 from public.permission_types where id = p_permission_type_id) then
    raise exception 'Permission type not found.' using errcode = 'PT404';
  end if;

  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then
    raise exception 'A workflow needs at least one stage.' using errcode = 'PT422';
  end if;

  select coalesce(array_agg(f ->> 'key'), '{}') into v_schema_keys
  from public.permission_types pt
  cross join lateral jsonb_array_elements(coalesce(pt.form_schema -> 'fields', '[]'::jsonb)) f
  where pt.id = p_permission_type_id;

  select coalesce(max(version), 0) + 1 into v_version
  from public.workflow_templates where permission_type_id = p_permission_type_id;

  insert into public.workflow_templates (permission_type_id, name, version, is_active, created_by)
  values (p_permission_type_id, coalesce(nullif(btrim(p_name), ''), 'Workflow'), v_version, false, v_actor)
  returning id into v_template_id;

  for v_stage in select * from jsonb_array_elements(p_stages) loop
    perform public.engine_insert_stage(v_template_id, v_stage, v_schema_keys);
  end loop;

  perform public.write_audit(v_actor, 'CREATE_WORKFLOW_TEMPLATE', 'workflow_template', v_template_id,
    jsonb_build_object('permission_type_id', p_permission_type_id, 'version', v_version));

  return v_template_id;
end;
$$;

create or replace function public.api_admin_update_workflow_draft(
  p_template_id uuid,
  p_name text,
  p_stages jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_template public.workflow_templates;
  v_schema_keys text[];
  v_stage jsonb;
begin
  select * into v_template from public.workflow_templates where id = p_template_id for update;
  if v_template.id is null then
    raise exception 'Workflow template not found.' using errcode = 'PT404';
  end if;

  if public.workflow_template_locked(p_template_id) then
    raise exception 'Published workflows are immutable. Create a new version instead.' using errcode = 'PT409';
  end if;

  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then
    raise exception 'A workflow needs at least one stage.' using errcode = 'PT422';
  end if;

  select coalesce(array_agg(f ->> 'key'), '{}') into v_schema_keys
  from public.permission_types pt
  cross join lateral jsonb_array_elements(coalesce(pt.form_schema -> 'fields', '[]'::jsonb)) f
  where pt.id = v_template.permission_type_id;

  delete from public.workflow_stages where template_id = p_template_id;

  for v_stage in select * from jsonb_array_elements(p_stages) loop
    perform public.engine_insert_stage(p_template_id, v_stage, v_schema_keys);
  end loop;

  update public.workflow_templates
  set name = coalesce(nullif(btrim(p_name), ''), name)
  where id = p_template_id;

  perform public.write_audit(v_actor, 'UPDATE_WORKFLOW_DRAFT', 'workflow_template', p_template_id, '{}'::jsonb);
end;
$$;

create or replace function public.api_admin_publish_workflow_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_template public.workflow_templates;
begin
  select * into v_template from public.workflow_templates where id = p_template_id for update;
  if v_template.id is null then
    raise exception 'Workflow template not found.' using errcode = 'PT404';
  end if;

  if not exists (select 1 from public.workflow_stages where template_id = p_template_id) then
    raise exception 'Cannot publish a workflow without stages.' using errcode = 'PT422';
  end if;

  update public.workflow_templates
  set is_active = false
  where permission_type_id = v_template.permission_type_id and is_active;

  update public.workflow_templates set is_active = true where id = p_template_id;

  perform public.write_audit(v_actor, 'PUBLISH_WORKFLOW', 'workflow_template', p_template_id,
    jsonb_build_object('permission_type_id', v_template.permission_type_id, 'version', v_template.version));
end;
$$;

create or replace function public.api_admin_deactivate_workflow_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
begin
  update public.workflow_templates set is_active = false where id = p_template_id;
  if not found then
    raise exception 'Workflow template not found.' using errcode = 'PT404';
  end if;
  perform public.write_audit(v_actor, 'DEACTIVATE_WORKFLOW', 'workflow_template', p_template_id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Users, roles and departments
-- ---------------------------------------------------------------------------

create or replace function public.api_admin_set_user_roles(p_user_id uuid, p_roles jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_item jsonb;
  v_role uuid;
  v_dept uuid;
  v_has_admin boolean := false;
  v_other_admin boolean;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found.' using errcode = 'PT404';
  end if;

  if jsonb_typeof(p_roles) <> 'array' then
    raise exception 'Roles must be an array.' using errcode = 'PT422';
  end if;

  for v_item in select * from jsonb_array_elements(p_roles) loop
    v_role := public.try_uuid(v_item ->> 'roleId');
    v_dept := public.try_uuid(v_item ->> 'departmentId');

    if v_role is null or not exists (select 1 from public.roles where id = v_role) then
      raise exception 'Unknown role in assignment.' using errcode = 'PT422';
    end if;

    if v_dept is not null and not exists (select 1 from public.departments where id = v_dept) then
      raise exception 'Unknown department in assignment.' using errcode = 'PT422';
    end if;

    if exists (select 1 from public.roles where id = v_role and name = 'admin') then
      v_has_admin := true;
    end if;
  end loop;

  -- Never allow the platform to lose its last active administrator.
  if not v_has_admin then
    select exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.profiles p on p.id = ur.user_id
      where r.name = 'admin' and ur.is_active and p.is_active
        and ur.user_id <> p_user_id
        and (ur.starts_at is null or ur.starts_at <= now())
        and (ur.ends_at is null or ur.ends_at > now())
    ) into v_other_admin;

    if exists (
      select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = p_user_id and ur.is_active and r.name = 'admin'
    ) and not v_other_admin then
      raise exception 'At least one active administrator is required.' using errcode = 'PT409';
    end if;
  end if;

  update public.user_roles set is_active = false where user_id = p_user_id and is_active;

  for v_item in select * from jsonb_array_elements(p_roles) loop
    v_role := (v_item ->> 'roleId')::uuid;
    v_dept := public.try_uuid(v_item ->> 'departmentId');

    if exists (
      select 1 from public.user_roles
      where user_id = p_user_id and role_id = v_role
        and department_id is not distinct from v_dept
    ) then
      update public.user_roles
      set is_active = true, starts_at = null, ends_at = null
      where user_id = p_user_id and role_id = v_role
        and department_id is not distinct from v_dept;
    else
      insert into public.user_roles (user_id, role_id, department_id, is_active)
      values (p_user_id, v_role, v_dept, true);
    end if;
  end loop;

  perform public.write_audit(v_actor, 'SET_USER_ROLES', 'user', p_user_id,
    jsonb_build_object('roles', p_roles));
end;
$$;

create or replace function public.api_admin_update_profile(
  p_user_id uuid,
  p_name text,
  p_department_id uuid,
  p_is_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_profile public.profiles;
  v_other_admin boolean;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile.id is null then
    raise exception 'User not found.' using errcode = 'PT404';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'A name is required.' using errcode = 'PT422';
  end if;

  if p_department_id is not null and not exists (
    select 1 from public.departments where id = p_department_id
  ) then
    raise exception 'Department not found.' using errcode = 'PT404';
  end if;

  if p_user_id = v_actor and coalesce(p_is_active, true) = false then
    raise exception 'You cannot deactivate your own account.' using errcode = 'PT409';
  end if;

  if coalesce(p_is_active, true) = false and public.is_admin(p_user_id) then
    select exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.profiles p on p.id = ur.user_id
      where r.name = 'admin' and ur.is_active and p.is_active
        and ur.user_id <> p_user_id
        and (ur.starts_at is null or ur.starts_at <= now())
        and (ur.ends_at is null or ur.ends_at > now())
    ) into v_other_admin;

    if not v_other_admin then
      raise exception 'At least one active administrator is required.' using errcode = 'PT409';
    end if;
  end if;

  update public.profiles
  set name = btrim(p_name),
      department_id = p_department_id,
      is_active = coalesce(p_is_active, true)
  where id = p_user_id;

  perform public.write_audit(v_actor, 'UPDATE_USER', 'user', p_user_id, jsonb_build_object(
    'name', p_name, 'department_id', p_department_id, 'is_active', p_is_active
  ));
end;
$$;

create or replace function public.api_admin_upsert_department(
  p_id uuid,
  p_name text,
  p_parent_id uuid default null,
  p_head_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_id uuid := p_id;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'A department name is required.' using errcode = 'PT422';
  end if;

  if p_parent_id is not null then
    if p_parent_id = p_id then
      raise exception 'A department cannot be its own parent.' using errcode = 'PT422';
    end if;
    if not exists (select 1 from public.departments where id = p_parent_id) then
      raise exception 'Parent department not found.' using errcode = 'PT404';
    end if;

    if v_id is not null and exists (
      with recursive descendants as (
        select id from public.departments where id = v_id
        union all
        select d.id from public.departments d join descendants x on d.parent_id = x.id
      )
      select 1 from descendants where id = p_parent_id
    ) then
      raise exception 'That parent would create a department cycle.' using errcode = 'PT422';
    end if;
  end if;

  if p_head_user_id is not null and not exists (
    select 1 from public.profiles where id = p_head_user_id and is_active
  ) then
    raise exception 'The department head must be an active user.' using errcode = 'PT422';
  end if;

  if v_id is null then
    insert into public.departments (name, parent_id, head_user_id)
    values (btrim(p_name), p_parent_id, p_head_user_id)
    returning id into v_id;
  else
    update public.departments
    set name = btrim(p_name), parent_id = p_parent_id, head_user_id = p_head_user_id
    where id = v_id;

    if not found then
      raise exception 'Department not found.' using errcode = 'PT404';
    end if;
  end if;

  perform public.write_audit(v_actor, 'UPSERT_DEPARTMENT', 'department', v_id,
    jsonb_build_object('name', p_name, 'parent_id', p_parent_id, 'head_user_id', p_head_user_id));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Document verification
-- ---------------------------------------------------------------------------

create or replace function public.api_verify_document(p_document_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_doc public.request_documents;
begin
  if p_status not in ('PENDING', 'VERIFIED', 'REJECTED') then
    raise exception 'Invalid verification status.' using errcode = 'PT422';
  end if;

  select * into v_doc from public.request_documents where id = p_document_id;
  if v_doc.id is null then
    raise exception 'Document not found.' using errcode = 'PT404';
  end if;

  if not (public.is_admin(v_actor) or public.can_act_on_stage(
    (select current_stage_id from public.permission_requests where id = v_doc.request_id), v_actor
  )) then
    raise exception 'You cannot verify documents on this request.' using errcode = 'PT403';
  end if;

  update public.request_documents set verification_status = p_status where id = p_document_id;

  perform public.write_audit(v_actor, 'VERIFY_DOCUMENT', 'request_document', p_document_id,
    jsonb_build_object('status', p_status, 'request_id', v_doc.request_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Directory lookups (scoped, read-only, no role escalation)
-- ---------------------------------------------------------------------------

create or replace function public.api_search_users(p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x) order by x.name), '[]'::jsonb) into v_result
  from (
    select p.id, p.name, p.email, d.name as department
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    where p.is_active
      and (
        p_query is null or btrim(p_query) = ''
        or p.name ilike '%' || btrim(p_query) || '%'
        or p.email ilike '%' || btrim(p_query) || '%'
      )
      and (
        p.id = v_actor
        or public.is_admin(v_actor)
        -- Non-admins only discover people in their own department. This keeps
        -- the directory from becoming a university-wide email harvester while
        -- still letting project owners build their team.
        or exists (
          select 1 from public.profiles me
          where me.id = v_actor
            and me.department_id is not null
            and p.department_id = me.department_id
        )
      )
    order by p.name
    limit 25
  ) x;
  return v_result;
end;
$$;

create or replace function public.api_staff_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x) order by x.name), '[]'::jsonb) into v_result
  from (
    select p.id, p.name, p.email, d.name as department,
           array_agg(r.name order by r.name) as roles
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.is_active
    join public.roles r on r.id = ur.role_id
    left join public.departments d on d.id = p.department_id
    where p.is_active
      and r.name in ('faculty_guide', 'department_head', 'lab_manager', 'dean', 'admin')
      and (ur.starts_at is null or ur.starts_at <= now())
      and (ur.ends_at is null or ur.ends_at > now())
    group by p.id, p.name, p.email, d.name
  ) x;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------

create or replace function public.api_admin_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_result jsonb;
begin
  select jsonb_build_object(
    'generatedAt', now(),
    'totalRequests', (select count(*) from public.permission_requests),
    'byStatus', (
      select coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
      from (select status, count(*) c from public.permission_requests group by status) s
    ),
    'pendingApprovals', (
      select count(*) from public.request_stage_states where status = 'ACTIVE'
    ),
    'overdueApprovals', (
      select count(*) from public.request_stage_states
      where status = 'ACTIVE' and due_at is not null and due_at < now()
    ),
    'stalledRequests', (
      select count(*) from public.permission_requests
      where status = 'UNDER_REVIEW' and current_stage_id is null
    ),
    'averageStageHours', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.avg_hours desc), '[]'::jsonb)
      from (
        select
          st.name as stage,
          pt.name as permission_type,
          count(*) as completed,
          round((avg(extract(epoch from (ss.completed_at - ss.started_at))) / 3600)::numeric, 1) as avg_hours
        from public.request_stage_states ss
        join public.workflow_stages st on st.id = ss.stage_id
        join public.workflow_templates wt on wt.id = st.template_id
        join public.permission_types pt on pt.id = wt.permission_type_id
        where ss.completed_at is not null and ss.started_at is not null
          and ss.status in ('APPROVED', 'REJECTED')
        group by st.id, st.name, pt.name
        order by avg(extract(epoch from (ss.completed_at - ss.started_at))) desc
        limit 10
      ) x
    ),
    'bottlenecks', (
      select coalesce(jsonb_agg(row_to_json(y)), '[]'::jsonb)
      from (
        select
          st.name as stage,
          pt.name as permission_type,
          count(*) filter (where ss.status = 'ACTIVE') as active,
          count(*) filter (where ss.status = 'ACTIVE' and ss.due_at < now()) as overdue
        from public.request_stage_states ss
        join public.workflow_stages st on st.id = ss.stage_id
        join public.workflow_templates wt on wt.id = st.template_id
        join public.permission_types pt on pt.id = wt.permission_type_id
        group by st.id, st.name, pt.name
        having count(*) filter (where ss.status in ('ACTIVE', 'WAITING_STUDENT')) > 0
        order by count(*) filter (where ss.status = 'ACTIVE') desc
        limit 10
      ) y
    ),
    'recentActions', (
      select coalesce(jsonb_agg(row_to_json(z) order by z.created_at desc), '[]'::jsonb)
      from (
        select
          aa.id, aa.action, aa.created_at, aa.request_id,
          p.name as actor_name, pt.name as permission_type
        from public.approval_actions aa
        join public.profiles p on p.id = aa.actor_id
        join public.permission_requests pr on pr.id = aa.request_id
        join public.permission_types pt on pt.id = pr.permission_type_id
        where aa.action in ('APPROVE_STAGE', 'REJECT_REQUEST', 'REQUEST_CHANGES', 'ISSUE_FINAL_PERMISSION')
        order by aa.created_at desc
        limit 12
      ) z
    ),
    'weeklyVolume', (
      select coalesce(jsonb_agg(row_to_json(w) order by w.week), '[]'::jsonb)
      from (
        select
          to_char(date_trunc('week', coalesce(submitted_at, created_at)), 'YYYY-MM-DD') as week,
          count(*) as requests
        from public.permission_requests
        where coalesce(submitted_at, created_at) > now() - interval '8 weeks'
        group by date_trunc('week', coalesce(submitted_at, created_at))
      ) w
    )
  ) into v_result;

  return v_result;
end;
$$;
