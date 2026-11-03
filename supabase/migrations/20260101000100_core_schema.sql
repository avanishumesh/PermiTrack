-- =============================================================================
-- PermiTrack 0001: core schema
-- =============================================================================
-- Design notes
--  * All tables live in `public` and have RLS enabled (see 0004_rls.sql).
--  * Direct writes from the browser are denied for workflow tables. Every state
--    transition happens through a SECURITY DEFINER function which re-checks the
--    caller, takes a row lock and writes audit/revision rows in the same
--    transaction.
--  * Workflow templates are immutable once published (or once referenced by a
--    request). Editing a workflow always creates a new version, so in-flight
--    requests keep the version they started on.
-- =============================================================================

-- `gen_random_uuid()` is built into PostgreSQL 13+, so no extension is required.
-- (Supabase also provides pgcrypto; we intentionally avoid depending on it.)

-- ---------------------------------------------------------------------------
-- Organizational structure
-- ---------------------------------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.departments(id) on delete set null,
  head_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  department_id uuid references public.departments(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.departments
  add constraint departments_head_user_id_fkey
  foreign key (head_user_id) references public.profiles(id) on delete set null;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint user_roles_dates_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- One assignment per (user, role, scope). NULL department means "university wide".
create unique index user_roles_unique_assignment
  on public.user_roles (user_id, role_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index user_roles_user_idx on public.user_roles (user_id);
create index user_roles_role_idx on public.user_roles (role_id, department_id);
create index profiles_department_idx on public.profiles (department_id);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  department_id uuid not null references public.departments(id),
  created_by uuid not null references public.profiles(id),
  faculty_guide_id uuid references public.profiles(id),
  category text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'MEMBER'
    check (role in ('OWNER', 'EDITOR', 'MEMBER', 'FACULTY_GUIDE')),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_idx on public.project_members (user_id);
create index projects_department_idx on public.projects (department_id);
create index projects_guide_idx on public.projects (faculty_guide_id);

-- ---------------------------------------------------------------------------
-- Permission catalogue
-- ---------------------------------------------------------------------------

create table public.permission_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  department_id uuid references public.departments(id) on delete set null,
  is_active boolean not null default true,
  form_schema jsonb not null default '{"fields": []}'::jsonb,
  eligibility_rules jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permission_types_form_schema_is_object check (jsonb_typeof(form_schema) = 'object')
);

create table public.required_document_types (
  id uuid primary key default gen_random_uuid(),
  permission_type_id uuid not null references public.permission_types(id) on delete cascade,
  name text not null,
  description text,
  is_required boolean not null default true,
  accepted_mime_types text[] not null default array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  max_size_mb integer not null default 10 check (max_size_mb between 1 and 10),
  created_at timestamptz not null default now()
);

create index required_document_types_permission_idx
  on public.required_document_types (permission_type_id);

-- ---------------------------------------------------------------------------
-- Workflow templates (versioned, immutable once published)
-- ---------------------------------------------------------------------------

create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  permission_type_id uuid not null references public.permission_types(id) on delete cascade,
  name text not null,
  version integer not null check (version > 0),
  is_active boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (permission_type_id, version)
);

-- At most one active workflow per permission type.
create unique index workflow_templates_one_active
  on public.workflow_templates (permission_type_id) where is_active;

create table public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workflow_templates(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  name text not null,
  approver_type text not null check (approver_type in (
    'PROJECT_FACULTY_GUIDE', 'DEPARTMENT_HEAD', 'ROLE', 'USER', 'LAB_MANAGER', 'DEAN', 'CUSTOM'
  )),
  approver_role_id uuid references public.roles(id),
  approver_user_id uuid references public.profiles(id),
  department_scope text not null default 'PROJECT_DEPARTMENT'
    check (department_scope in ('PROJECT_DEPARTMENT', 'PARENT_DEPARTMENT', 'ROOT_DEPARTMENT')),
  can_edit_fields text[] not null default '{}',
  invalidates_on text[] not null default '{}',
  sla_hours integer check (sla_hours is null or sla_hours between 1 and 8760),
  conditions jsonb,
  created_at timestamptz not null default now(),
  unique (template_id, sequence),
  constraint workflow_stages_approver_configured check (
    approver_type not in ('ROLE', 'CUSTOM') or approver_role_id is not null or approver_user_id is not null
  ),
  constraint workflow_stages_role_configured check (
    approver_type <> 'ROLE' or approver_role_id is not null
  )
);

create index workflow_stages_template_idx on public.workflow_stages (template_id, sequence);

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------

create table public.permission_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  permission_type_id uuid not null references public.permission_types(id),
  workflow_template_id uuid references public.workflow_templates(id),
  created_by uuid not null references public.profiles(id),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED',
    'APPROVED', 'REJECTED', 'WITHDRAWN'
  )),
  current_stage_id uuid,
  form_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  withdrawn_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  issued_conditions jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permission_requests_form_data_is_object check (jsonb_typeof(form_data) = 'object'),
  constraint permission_requests_validity check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  )
);

create index permission_requests_project_idx on public.permission_requests (project_id);
create index permission_requests_creator_idx on public.permission_requests (created_by);
create index permission_requests_status_idx on public.permission_requests (status);
create index permission_requests_template_idx on public.permission_requests (workflow_template_id);

create table public.request_stage_states (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.permission_requests(id) on delete cascade,
  stage_id uuid not null references public.workflow_stages(id),
  sequence integer not null,
  status text not null default 'PENDING' check (status in (
    'PENDING', 'ACTIVE', 'WAITING_STUDENT', 'APPROVED', 'REJECTED', 'SKIPPED', 'INVALIDATED'
  )),
  assigned_approver_id uuid references public.profiles(id),
  delegated_from_user_id uuid references public.profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  due_at timestamptz,
  decision_comment text,
  updated_at timestamptz not null default now(),
  unique (request_id, stage_id)
);

alter table public.permission_requests
  add constraint permission_requests_current_stage_fkey
  foreign key (current_stage_id) references public.request_stage_states(id) on delete set null;

create index request_stage_states_request_idx
  on public.request_stage_states (request_id, sequence);
create index request_stage_states_approver_idx
  on public.request_stage_states (assigned_approver_id, status);
create index request_stage_states_due_idx
  on public.request_stage_states (due_at) where status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Approval trail
-- ---------------------------------------------------------------------------

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.permission_requests(id) on delete cascade,
  stage_id uuid references public.workflow_stages(id),
  stage_state_id uuid references public.request_stage_states(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in (
    'SUBMIT_REQUEST', 'APPROVE_STAGE', 'REJECT_REQUEST', 'REQUEST_CHANGES',
    'ASK_QUERY', 'ANSWER_QUERY', 'RESUBMIT_REQUEST', 'EDIT_REQUEST_BY_AUTHORITY',
    'UPLOAD_DOCUMENT', 'REPLACE_DOCUMENT', 'FORWARD_STAGE', 'DELEGATE_STAGE',
    'WITHDRAW_REQUEST', 'ISSUE_FINAL_PERMISSION'
  )),
  from_status text,
  to_status text,
  comment text,
  is_internal boolean not null default false,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index approval_actions_request_idx
  on public.approval_actions (request_id, created_at desc);
create index approval_actions_actor_idx on public.approval_actions (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

create table public.request_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.permission_requests(id) on delete cascade,
  required_document_type_id uuid references public.required_document_types(id) on delete set null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  storage_path text not null unique,
  version integer not null default 1 check (version > 0),
  verification_status text not null default 'PENDING'
    check (verification_status in ('PENDING', 'VERIFIED', 'REJECTED')),
  uploaded_by uuid not null references public.profiles(id),
  replaced_by uuid references public.request_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (request_id, required_document_type_id, version)
);

create index request_documents_request_idx on public.request_documents (request_id);

-- ---------------------------------------------------------------------------
-- Revisions and queries
-- ---------------------------------------------------------------------------

create table public.request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.permission_requests(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  revision_type text not null check (revision_type in (
    'STUDENT_EDIT', 'STUDENT_RESUBMISSION', 'AUTHORITY_EDIT',
    'DOCUMENT_REPLACEMENT', 'WORKFLOW_REVALIDATION'
  )),
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index request_revisions_request_idx
  on public.request_revisions (request_id, created_at desc);

create table public.queries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.permission_requests(id) on delete cascade,
  stage_id uuid references public.workflow_stages(id),
  asked_by uuid not null references public.profiles(id),
  responded_by uuid references public.profiles(id),
  question text not null,
  response text,
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED', 'CLOSED')),
  is_blocking boolean not null default true,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  resolved_at timestamptz
);

create index queries_request_idx on public.queries (request_id, status);
create index queries_stage_idx on public.queries (stage_id, status);

-- ---------------------------------------------------------------------------
-- Notifications and audit
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.permission_requests(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger departments_touch before update on public.departments
  for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger permission_types_touch before update on public.permission_types
  for each row execute function public.touch_updated_at();
create trigger workflow_templates_touch before update on public.workflow_templates
  for each row execute function public.touch_updated_at();
create trigger permission_requests_touch before update on public.permission_requests
  for each row execute function public.touch_updated_at();
create trigger request_stage_states_touch before update on public.request_stage_states
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- New auth user -> profile + default student role
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (id) do update set email = excluded.email;

  insert into public.user_roles (user_id, role_id)
  select new.id, r.id from public.roles r where r.name = 'student'
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Workflow immutability
-- ---------------------------------------------------------------------------

create or replace function public.workflow_template_locked(p_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select t.is_active
       or exists (select 1 from public.permission_requests r where r.workflow_template_id = t.id)
    from public.workflow_templates t
    where t.id = p_template_id
  ), false);
$$;

create or replace function public.enforce_workflow_stage_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_template uuid := coalesce(new.template_id, old.template_id);
begin
  if public.workflow_template_locked(v_template) then
    raise exception 'This workflow version is published and cannot be modified. Create a new version instead.'
      using errcode = 'PT409';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger workflow_stages_immutable
  before insert or update or delete on public.workflow_stages
  for each row execute function public.enforce_workflow_stage_immutability();

create or replace function public.enforce_workflow_template_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if public.workflow_template_locked(old.id) then
      raise exception 'This workflow version is in use and cannot be deleted.'
        using errcode = 'PT409';
    end if;
    return old;
  end if;

  if new.permission_type_id <> old.permission_type_id
     or new.version <> old.version
     or new.created_by is distinct from old.created_by then
    raise exception 'Workflow identity (permission type, version, author) is immutable.'
      using errcode = 'PT409';
  end if;

  return new;
end;
$$;

create trigger workflow_templates_identity
  before update or delete on public.workflow_templates
  for each row execute function public.enforce_workflow_template_identity();
