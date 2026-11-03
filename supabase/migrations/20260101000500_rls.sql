-- =============================================================================
-- PermiTrack 0005: Row Level Security + grants
-- =============================================================================
-- Model: authenticated users may READ rows they are authorized to see. They
-- receive no INSERT/UPDATE/DELETE table privileges at all - every write goes
-- through a SECURITY DEFINER RPC that re-checks identity. That gives two
-- independent layers: table privileges + RLS + function authorization.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.permission_types enable row level security;
alter table public.required_document_types enable row level security;
alter table public.workflow_templates enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.permission_requests enable row level security;
alter table public.request_stage_states enable row level security;
alter table public.approval_actions enable row level security;
alter table public.request_documents enable row level security;
alter table public.request_revisions enable row level security;
alter table public.queries enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles ------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.can_view_profile(id));

create policy departments_select on public.departments
  for select to authenticated
  using (true);

create policy roles_select on public.roles
  for select to authenticated
  using (true);

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Projects ------------------------------------------------------------------
create policy projects_select on public.projects
  for select to authenticated
  using (public.can_view_project(id));

create policy project_members_select on public.project_members
  for select to authenticated
  using (public.can_view_project(project_id));

-- Catalogue -----------------------------------------------------------------
create policy permission_types_select on public.permission_types
  for select to authenticated
  using (is_active or public.is_admin());

create policy required_document_types_select on public.required_document_types
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.permission_types pt
      where pt.id = permission_type_id and pt.is_active
    )
  );

create policy workflow_templates_select on public.workflow_templates
  for select to authenticated
  using (true);

create policy workflow_stages_select on public.workflow_stages
  for select to authenticated
  using (true);

-- Requests ------------------------------------------------------------------
create policy permission_requests_select on public.permission_requests
  for select to authenticated
  using (public.can_view_request(id));

create policy request_stage_states_select on public.request_stage_states
  for select to authenticated
  using (public.can_view_request(request_id));

create policy approval_actions_select on public.approval_actions
  for select to authenticated
  using (
    public.can_view_request(request_id)
    and (not is_internal or public.can_view_internal(request_id))
  );

create policy request_documents_select on public.request_documents
  for select to authenticated
  using (public.can_view_request(request_id));

create policy request_revisions_select on public.request_revisions
  for select to authenticated
  using (public.can_view_request(request_id));

create policy queries_select on public.queries
  for select to authenticated
  using (public.can_view_request(request_id));

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Table privileges: read only for authenticated, nothing for anon
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;
grant select on all tables in schema public to authenticated;

-- RLS policies evaluate helper functions as the caller.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

grant execute on function public.can_view_request(uuid, uuid) to authenticated;
grant execute on function public.can_view_project(uuid, uuid) to authenticated;
grant execute on function public.can_view_profile(uuid, uuid) to authenticated;
grant execute on function public.can_view_internal(uuid, uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.has_role(text, uuid, uuid) to authenticated;
grant execute on function public.is_project_member(uuid, uuid) to authenticated;
grant execute on function public.is_request_creator(uuid, uuid) to authenticated;
grant execute on function public.can_edit_request_as_student(uuid, uuid) to authenticated;
grant execute on function public.can_upload_documents(uuid, uuid) to authenticated;
grant execute on function public.can_act_on_stage(uuid, uuid) to authenticated;
grant execute on function public.workflow_template_locked(uuid) to authenticated;

-- Public API surface. Internal engine_*, handle_* and notify_* helpers stay
-- private to the owner so they cannot be invoked directly from the API.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'api\_%'
  loop
    execute format('grant execute on function %s to authenticated', f.signature);
  end loop;
end;
$$;

-- Belt and braces: explicitly revoke the mutating internals.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'engine\_%'
        or p.proname like 'handle\_%'
        or p.proname in (
          'activate_stage', 'write_audit', 'notify_user', 'notify_project_team',
          'notify_admins', 'validate_form_data', 'assert_required_documents',
          'handle_new_user', 'touch_updated_at', 'enforce_workflow_stage_immutability',
          'enforce_workflow_template_identity'
        )
      )
  loop
    execute format('revoke execute on function %s from authenticated', f.signature);
  end loop;
end;
$$;
