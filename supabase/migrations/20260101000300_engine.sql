-- =============================================================================
-- PermiTrack 0003: workflow engine
-- =============================================================================
-- All mutations are transactional. `api_perform_action` is the single entry
-- point for approval actions; it locks the request row so two approvers cannot
-- advance the same stage concurrently.
--
-- Internal helpers use the `engine_` prefix and have EXECUTE revoked at the end
-- of the migration - they must only ever be reached through an api_* function.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared queries
-- ---------------------------------------------------------------------------

create or replace function public.engine_lock_request(p_request_id uuid)
returns public.permission_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests;
begin
  select * into v_request
  from public.permission_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Permission request not found.' using errcode = 'PT404';
  end if;

  return v_request;
end;
$$;

create or replace function public.engine_require_not_closed(p_request public.permission_requests)
returns void
language plpgsql
immutable
as $$
begin
  if p_request.status in ('APPROVED', 'REJECTED', 'WITHDRAWN') then
    raise exception 'This request is % and can no longer be modified.', p_request.status
      using errcode = 'PT409';
  end if;
end;
$$;

create or replace function public.first_pending_stage(p_request_id uuid)
returns public.request_stage_states
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.request_stage_states;
begin
  select * into v_state
  from public.request_stage_states
  where request_id = p_request_id
    and status in ('PENDING', 'INVALIDATED')
  order by sequence asc
  limit 1;
  return v_state;
end;
$$;

create or replace function public.next_pending_stage(p_request_id uuid, p_after_sequence integer)
returns public.request_stage_states
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.request_stage_states;
begin
  select * into v_state
  from public.request_stage_states
  where request_id = p_request_id
    and sequence > p_after_sequence
    and status in ('PENDING', 'INVALIDATED')
  order by sequence asc
  limit 1;
  return v_state;
end;
$$;

create or replace function public.missing_required_documents(p_request_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_names text[];
begin
  select coalesce(array_agg(rdt.name order by rdt.name), '{}')
  into v_names
  from public.permission_requests r
  join public.required_document_types rdt on rdt.permission_type_id = r.permission_type_id
  where r.id = p_request_id
    and rdt.is_required
    and not exists (
      select 1
      from public.request_documents d
      where d.request_id = r.id
        and d.required_document_type_id = rdt.id
        and d.replaced_by is null
        and d.verification_status <> 'REJECTED'
    );
  return coalesce(v_names, '{}');
end;
$$;

create or replace function public.assert_required_documents(p_request_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_missing text[] := public.missing_required_documents(p_request_id);
begin
  if cardinality(v_missing) > 0 then
    raise exception 'Missing required documents: %', array_to_string(v_missing, ', ')
      using errcode = 'PT422';
  end if;
end;
$$;

create or replace function public.stage_conditions_met(p_request_id uuid, p_stage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.evaluate_condition(st.conditions, r.form_data), true)
  from public.workflow_stages st
  join public.permission_requests r on r.id = p_request_id
  where st.id = p_stage_id;
$$;

-- All earlier stages must be approved or skipped, required documents present
-- and the stage's own conditions satisfied.
create or replace function public.stage_prerequisites_met(p_request_id uuid, p_stage_state_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.request_stage_states;
begin
  select * into v_state from public.request_stage_states
  where id = p_stage_state_id and request_id = p_request_id;

  if v_state.id is null then
    return false;
  end if;

  if exists (
    select 1 from public.request_stage_states ss
    where ss.request_id = p_request_id
      and ss.sequence < v_state.sequence
      and ss.status not in ('APPROVED', 'SKIPPED')
  ) then
    return false;
  end if;

  if cardinality(public.missing_required_documents(p_request_id)) > 0 then
    return false;
  end if;

  return public.stage_conditions_met(p_request_id, v_state.stage_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Stage activation
-- ---------------------------------------------------------------------------

-- Resolves the approver, activates the stage and points the request at it.
-- Returns false (and alerts admins) when no active approver can be resolved.
create or replace function public.activate_stage(p_request_id uuid, p_stage_state_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.request_stage_states;
  v_stage public.workflow_stages;
  v_approver uuid;
  v_due timestamptz;
begin
  select * into v_state
  from public.request_stage_states
  where id = p_stage_state_id and request_id = p_request_id
  for update;

  if v_state.id is null then
    raise exception 'Workflow stage state not found.' using errcode = 'PT404';
  end if;

  select * into v_stage from public.workflow_stages where id = v_state.stage_id;
  v_approver := public.resolve_approver(p_request_id, v_state.stage_id);

  if v_approver is null then
    perform public.notify_admins(
      p_request_id,
      'MISSING_APPROVER',
      'Approver required',
      format('"%s" has no active approver. Assign one to keep the request moving.', v_stage.name)
    );
    perform public.write_audit(
      auth.uid(), 'MISSING_APPROVER', 'permission_request', p_request_id,
      jsonb_build_object('stage_id', v_stage.id, 'stage', v_stage.name)
    );
    return false;
  end if;

  v_due := case
    when v_stage.sla_hours is null then null
    else now() + make_interval(hours => v_stage.sla_hours)
  end;

  update public.request_stage_states
  set status = 'ACTIVE',
      assigned_approver_id = v_approver,
      delegated_from_user_id = null,
      started_at = coalesce(started_at, now()),
      due_at = v_due,
      completed_at = null,
      decision_comment = null
  where id = v_state.id;

  update public.permission_requests
  set status = 'UNDER_REVIEW',
      current_stage_id = v_state.id
  where id = p_request_id;

  perform public.notify_user(
    v_approver,
    p_request_id,
    'NEW_APPROVAL_TASK',
    'New approval request',
    'A permission request is waiting for your review.',
    '/requests/' || p_request_id::text
  );

  perform public.write_audit(
    auth.uid(), 'STAGE_ACTIVATED', 'permission_request', p_request_id,
    jsonb_build_object('stage_id', v_stage.id, 'stage', v_stage.name, 'approver_id', v_approver)
  );

  return true;
end;
$$;

-- Advance to the first eligible next stage, skipping stages whose conditions are
-- false. Returns the activation result and whether the request was finalized.
create or replace function public.engine_advance_request(p_request_id uuid, p_after_sequence integer, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next public.request_stage_states;
  v_stage public.workflow_stages;
  v_activated boolean;
  v_guard integer := 0;
begin
  loop
    v_guard := v_guard + 1;
    if v_guard > 100 then
      raise exception 'Workflow loop detected.' using errcode = 'PT409';
    end if;

    select * into v_next from public.request_stage_states
    where request_id = p_request_id
      and sequence > p_after_sequence
      and status in ('PENDING', 'INVALIDATED')
    order by sequence asc
    limit 1;

    if v_next.id is null then
      perform public.engine_finalize_approval(p_request_id, p_actor);
      return jsonb_build_object('ok', true, 'finalized', true);
    end if;

    select * into v_stage from public.workflow_stages where id = v_next.stage_id;

    if not public.stage_conditions_met(p_request_id, v_next.stage_id) then
      update public.request_stage_states
      set status = 'SKIPPED', completed_at = now(),
          decision_comment = 'Skipped: stage conditions not met'
      where id = v_next.id;
      perform public.write_audit(
        p_actor, 'STAGE_SKIPPED', 'permission_request', p_request_id,
        jsonb_build_object('stage_id', v_next.stage_id, 'stage', v_stage.name)
      );
      continue;
    end if;

    if cardinality(public.missing_required_documents(p_request_id)) > 0 then
      update public.permission_requests
      set status = 'UNDER_REVIEW', current_stage_id = null
      where id = p_request_id;
      perform public.notify_project_team(
        p_request_id, 'DOCUMENTS_REQUIRED', 'Documents required',
        'A stage is ready to start but required documents are missing.', p_actor
      );
      return jsonb_build_object('ok', true, 'warning', 'MISSING_DOCUMENTS');
    end if;

    v_activated := public.activate_stage(p_request_id, v_next.id);
    if not v_activated then
      update public.permission_requests
      set status = 'UNDER_REVIEW', current_stage_id = null
      where id = p_request_id;
      return jsonb_build_object('ok', true, 'warning', 'MISSING_APPROVER');
    end if;

    return jsonb_build_object('ok', true, 'activated_stage_state_id', v_next.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Final approval
-- ---------------------------------------------------------------------------

create or replace function public.engine_finalize_approval(p_request_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests;
  v_from text;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
begin
  select * into v_request from public.permission_requests where id = p_request_id for update;
  v_from := v_request.status;

  begin
    v_valid_from := coalesce(nullif(v_request.form_data ->> 'start_date', '')::timestamptz, now());
  exception when others then
    v_valid_from := now();
  end;

  begin
    v_valid_until := nullif(v_request.form_data ->> 'end_date', '')::timestamptz;
  exception when others then
    v_valid_until := null;
  end;

  update public.permission_requests
  set status = 'APPROVED',
      approved_at = now(),
      current_stage_id = null,
      valid_from = v_valid_from,
      valid_until = v_valid_until
  where id = p_request_id;

  insert into public.approval_actions (
    request_id, actor_id, action, from_status, to_status, comment
  ) values (
    p_request_id, p_actor, 'ISSUE_FINAL_PERMISSION', v_from, 'APPROVED',
    'All required stages approved. Permission issued.'
  );

  perform public.notify_project_team(
    p_request_id, 'REQUEST_APPROVED', 'Request approved',
    'Your permission request has been approved.', p_actor
  );
  perform public.write_audit(
    p_actor, 'ISSUE_FINAL_PERMISSION', 'permission_request', p_request_id,
    jsonb_build_object('valid_from', v_valid_from, 'valid_until', v_valid_until)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

create or replace function public.engine_action(
  p_request_id uuid,
  p_stage_state_id uuid,
  p_actor uuid,
  p_action text,
  p_from_status text,
  p_to_status text,
  p_comment text,
  p_payload jsonb default '{}'::jsonb,
  p_is_internal boolean default false,
  p_stage_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stage_id uuid := p_stage_id;
begin
  if p_stage_state_id is not null then
    select stage_id into v_stage_id
    from public.request_stage_states where id = p_stage_state_id;
  end if;

  insert into public.approval_actions (
    request_id, stage_id, stage_state_id, actor_id, action,
    from_status, to_status, comment, payload, is_internal
  ) values (
    p_request_id, v_stage_id, p_stage_state_id, p_actor, p_action,
    p_from_status, p_to_status, p_comment, coalesce(p_payload, '{}'::jsonb), p_is_internal
  );

  perform public.write_audit(
    p_actor, p_action, 'permission_request', p_request_id,
    jsonb_build_object('stage_state_id', p_stage_state_id, 'from', p_from_status, 'to', p_to_status)
  );
end;
$$;

create or replace function public.engine_lock_stage(p_stage_state_id uuid, p_request_id uuid)
returns public.request_stage_states
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.request_stage_states;
begin
  select * into v_state from public.request_stage_states
  where id = p_stage_state_id and request_id = p_request_id
  for update;
  if v_state.id is null then
    raise exception 'Stage not found on this request.' using errcode = 'PT404';
  end if;
  return v_state;
end;
$$;

create or replace function public.engine_resolve_stage(p_request public.permission_requests, p_stage_state_id uuid, p_actor uuid)
returns public.request_stage_states
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.request_stage_states;
begin
  v_state := public.engine_lock_stage(
    coalesce(p_stage_state_id, p_request.current_stage_id),
    p_request.id
  );

  if not public.can_act_on_stage(v_state.id, p_actor) then
    raise exception 'You are not the assigned approver for this stage.'
      using errcode = 'PT403';
  end if;

  return v_state;
end;
$$;

-- APPROVE_STAGE -------------------------------------------------------------
create or replace function public.handle_approve_stage(
  p_request_id uuid,
  p_stage_state_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_state public.request_stage_states;
  v_result jsonb;
begin
  perform public.engine_require_not_closed(v_request);
  v_state := public.engine_resolve_stage(v_request, p_stage_state_id, p_actor);

  if v_state.status <> 'ACTIVE' then
    raise exception 'Only an active stage can be approved (current status: %).', v_state.status
      using errcode = 'PT409';
  end if;

  if exists (
    select 1 from public.queries q
    where q.request_id = p_request_id
      and q.status = 'OPEN'
      and q.is_blocking
      and (q.stage_id = v_state.stage_id or q.stage_id is null)
  ) then
    raise exception 'Resolve open queries before approving this stage.' using errcode = 'PT422';
  end if;

  update public.request_stage_states
  set status = 'APPROVED',
      completed_at = now(),
      decision_comment = nullif(btrim(coalesce(p_comment, '')), '')
  where id = v_state.id;

  perform public.engine_action(
    p_request_id, v_state.id, p_actor, 'APPROVE_STAGE', 'ACTIVE', 'APPROVED',
    p_comment, p_payload, coalesce((p_payload ->> 'is_internal')::boolean, false)
  );

  perform public.notify_project_team(
    p_request_id, 'STAGE_APPROVED', 'Stage approved',
    'A stage of your request was approved.', p_actor
  );

  v_result := public.engine_advance_request(p_request_id, v_state.sequence, p_actor);
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

-- REJECT_REQUEST ------------------------------------------------------------
create or replace function public.handle_reject_request(
  p_request_id uuid,
  p_stage_state_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_state public.request_stage_states;
  v_reason text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  perform public.engine_require_not_closed(v_request);

  if v_reason is null then
    raise exception 'A rejection reason is required.' using errcode = 'PT422';
  end if;

  v_state := public.engine_resolve_stage(v_request, p_stage_state_id, p_actor);

  if v_state.status <> 'ACTIVE' then
    raise exception 'Only an active stage can be rejected.' using errcode = 'PT409';
  end if;

  update public.request_stage_states
  set status = 'REJECTED', completed_at = now(), decision_comment = v_reason
  where id = v_state.id;

  update public.permission_requests
  set status = 'REJECTED', rejected_at = now(), current_stage_id = null
  where id = p_request_id;

  perform public.engine_action(
    p_request_id, v_state.id, p_actor, 'REJECT_REQUEST', 'ACTIVE', 'REJECTED',
    v_reason, p_payload, coalesce((p_payload ->> 'is_internal')::boolean, false)
  );

  perform public.notify_project_team(
    p_request_id, 'REQUEST_REJECTED', 'Request rejected',
    'Your permission request was rejected. Open it to read the reason.', p_actor
  );

  return jsonb_build_object('ok', true, 'status', 'REJECTED');
end;
$$;

-- REQUEST_CHANGES -----------------------------------------------------------
create or replace function public.handle_request_changes(
  p_request_id uuid,
  p_stage_state_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_state public.request_stage_states;
  v_reason text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  perform public.engine_require_not_closed(v_request);

  if v_reason is null then
    raise exception 'A change request reason is required.' using errcode = 'PT422';
  end if;

  v_state := public.engine_resolve_stage(v_request, p_stage_state_id, p_actor);

  if v_state.status <> 'ACTIVE' then
    raise exception 'Changes can only be requested on an active stage.' using errcode = 'PT409';
  end if;

  update public.request_stage_states
  set status = 'WAITING_STUDENT', decision_comment = v_reason
  where id = v_state.id;

  update public.permission_requests
  set status = 'CHANGES_REQUESTED', current_stage_id = v_state.id
  where id = p_request_id;

  insert into public.queries (request_id, stage_id, asked_by, question, status, is_blocking)
  values (p_request_id, v_state.stage_id, p_actor, v_reason, 'OPEN', true);

  perform public.engine_action(
    p_request_id, v_state.id, p_actor, 'REQUEST_CHANGES', 'ACTIVE', 'WAITING_STUDENT',
    v_reason, p_payload, coalesce((p_payload ->> 'is_internal')::boolean, false)
  );

  perform public.notify_project_team(
    p_request_id, 'CHANGES_REQUESTED', 'Changes requested',
    'An authority requested changes to your application.', p_actor
  );

  return jsonb_build_object('ok', true, 'status', 'CHANGES_REQUESTED');
end;
$$;

-- ASK_QUERY -----------------------------------------------------------------
create or replace function public.handle_ask_query(
  p_request_id uuid,
  p_stage_state_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_state public.request_stage_states;
  v_question text := nullif(btrim(coalesce(p_comment, '')), '');
  v_blocking boolean := coalesce((p_payload ->> 'is_blocking')::boolean, true);
begin
  perform public.engine_require_not_closed(v_request);

  if v_question is null then
    raise exception 'A question is required.' using errcode = 'PT422';
  end if;

  v_state := public.engine_resolve_stage(v_request, p_stage_state_id, p_actor);

  if v_state.status <> 'ACTIVE' and v_request.status <> 'CHANGES_REQUESTED' then
    raise exception 'Queries can only be asked while the request is under review.' using errcode = 'PT409';
  end if;

  insert into public.queries (request_id, stage_id, asked_by, question, status, is_blocking)
  values (p_request_id, v_state.stage_id, p_actor, v_question, 'OPEN', v_blocking);

  perform public.engine_action(
    p_request_id, v_state.id, p_actor, 'ASK_QUERY',
    v_state.status, v_state.status, v_question, p_payload,
    coalesce((p_payload ->> 'is_internal')::boolean, false)
  );

  perform public.notify_project_team(
    p_request_id, 'NEW_QUERY', 'New question',
    'An authority asked a question about your request.', p_actor
  );

  return jsonb_build_object('ok', true, 'blocking', v_blocking);
end;
$$;

-- ANSWER_QUERY --------------------------------------------------------------
create or replace function public.handle_answer_query(
  p_request_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_query public.queries;
  v_query_id uuid := nullif(p_payload ->> 'queryId', '')::uuid;
  v_response text := nullif(btrim(coalesce(p_payload ->> 'response', p_comment, '')), '');
  v_can_answer boolean;
begin
  perform public.engine_require_not_closed(v_request);

  if v_query_id is null then
    raise exception 'A query id is required.' using errcode = 'PT422';
  end if;

  v_can_answer := public.is_admin(p_actor)
    or v_request.created_by = p_actor
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = v_request.project_id
        and pm.user_id = p_actor
        and pm.role in ('OWNER', 'EDITOR')
    );

  if not v_can_answer then
    raise exception 'You are not allowed to answer this query.' using errcode = 'PT403';
  end if;

  if v_response is null then
    raise exception 'A response is required.' using errcode = 'PT422';
  end if;

  select * into v_query
  from public.queries
  where id = v_query_id and request_id = p_request_id
  for update;

  if v_query.id is null then
    raise exception 'Query not found on this request.' using errcode = 'PT404';
  end if;

  if v_query.status <> 'OPEN' then
    raise exception 'This query has already been resolved.' using errcode = 'PT409';
  end if;

  update public.queries
  set response = v_response,
      responded_by = p_actor,
      responded_at = now(),
      resolved_at = now(),
      status = 'RESOLVED'
  where id = v_query.id;

  perform public.engine_action(
    p_request_id, null, p_actor, 'ANSWER_QUERY',
    'OPEN', 'RESOLVED', v_response,
    jsonb_build_object('query_id', v_query.id),
    false, v_query.stage_id
  );

  perform public.notify_user(
    v_query.asked_by, p_request_id, 'QUERY_ANSWERED', 'Question answered',
    'The student answered your question.', '/requests/' || p_request_id::text
  );

  return jsonb_build_object('ok', true, 'query_id', v_query.id);
end;
$$;

-- RESUBMIT_REQUEST ----------------------------------------------------------
create or replace function public.handle_resubmit_request(
  p_request_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_state public.request_stage_states;
  v_stage public.workflow_stages;
  v_before jsonb;
  v_patch jsonb := coalesce(p_payload -> 'formData', '{}'::jsonb);
  v_after jsonb;
  v_query_id uuid := nullif(p_payload ->> 'queryId', '')::uuid;
  v_query public.queries;
  v_approver uuid;
begin
  if not public.can_edit_request_as_student(p_request_id, p_actor) then
    raise exception 'You are not allowed to resubmit this request.' using errcode = 'PT403';
  end if;

  if v_request.status <> 'CHANGES_REQUESTED' then
    raise exception 'Only a request awaiting changes can be resubmitted.' using errcode = 'PT409';
  end if;

  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'Form data must be an object.' using errcode = 'PT422';
  end if;

  select * into v_state
  from public.request_stage_states
  where id = v_request.current_stage_id
  for update;

  if v_state.id is null or v_state.status <> 'WAITING_STUDENT' then
    raise exception 'This request is not waiting on the student.' using errcode = 'PT409';
  end if;

  select * into v_stage from public.workflow_stages where id = v_state.stage_id;

  v_before := v_request.form_data;
  v_after := v_before || v_patch;

  perform public.validate_form_data(v_request.permission_type_id, v_after);
  perform public.assert_required_documents(p_request_id);

  if v_query_id is not null then
    select * into v_query from public.queries
    where id = v_query_id and request_id = p_request_id
    for update;

    if v_query.id is null then
      raise exception 'Query not found on this request.' using errcode = 'PT404';
    end if;
    if v_query.status <> 'OPEN' then
      raise exception 'This query has already been resolved.' using errcode = 'PT409';
    end if;

    update public.queries
    set response = coalesce(nullif(btrim(coalesce(p_payload ->> 'response', p_comment, '')), ''), response),
        responded_by = p_actor,
        responded_at = now(),
        resolved_at = now(),
        status = 'RESOLVED'
    where id = v_query.id;
  end if;

  v_approver := public.resolve_approver(p_request_id, v_state.stage_id);
  if v_approver is null then
    perform public.notify_admins(
      p_request_id, 'MISSING_APPROVER', 'Approver required',
      format('"%s" has no active approver. The resubmission cannot be routed.', v_stage.name)
    );
    return jsonb_build_object('ok', false, 'code', 'MISSING_APPROVER',
      'message', 'No active approver is available for this stage. An administrator has been notified.');
  end if;

  update public.permission_requests
  set form_data = v_after,
      status = 'UNDER_REVIEW',
      submitted_at = now()
  where id = p_request_id;

  insert into public.request_revisions (
    request_id, actor_id, revision_type, before_data, after_data, reason
  ) values (
    p_request_id, p_actor, 'STUDENT_RESUBMISSION', v_before, v_after,
    nullif(btrim(coalesce(p_payload ->> 'reason', p_comment, '')), '')
  );

  update public.request_stage_states
  set status = 'ACTIVE',
      assigned_approver_id = v_approver,
      delegated_from_user_id = null,
      due_at = case
        when v_stage.sla_hours is null then null
        else now() + make_interval(hours => v_stage.sla_hours)
      end
  where id = v_state.id;

  update public.permission_requests
  set current_stage_id = v_state.id
  where id = p_request_id;

  perform public.engine_action(
    p_request_id, v_state.id, p_actor, 'RESUBMIT_REQUEST',
    'CHANGES_REQUESTED', 'UNDER_REVIEW',
    nullif(btrim(coalesce(p_comment, '')), ''),
    jsonb_build_object('query_id', v_query_id)
  );

  perform public.notify_user(
    v_approver, p_request_id, 'RESUBMISSION_RECEIVED', 'Resubmission received',
    'The student updated the request and it is ready for review.',
    '/requests/' || p_request_id::text
  );

  return jsonb_build_object('ok', true, 'status', 'UNDER_REVIEW');
end;
$$;

-- EDIT_REQUEST_BY_AUTHORITY -------------------------------------------------
create or replace function public.handle_authority_edit(
  p_request_id uuid,
  p_stage_state_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_state public.request_stage_states;
  v_stage public.workflow_stages;
  v_patch jsonb := coalesce(p_payload -> 'formData', '{}'::jsonb);
  v_before jsonb;
  v_after jsonb;
  v_material text[];
  v_changed text[];
  v_key text;
  v_allowed boolean;
  v_invalid_seqs integer[];
  v_earliest integer;
  v_reset_count integer;
  v_activated boolean;
  v_reason text := nullif(btrim(coalesce(p_payload ->> 'reason', p_comment, '')), '');
  v_is_admin boolean := public.is_admin(p_actor);
begin
  perform public.engine_require_not_closed(v_request);
  v_state := public.engine_resolve_stage(v_request, p_stage_state_id, p_actor);
  select * into v_stage from public.workflow_stages where id = v_state.stage_id;

  if v_state.status <> 'ACTIVE' then
    raise exception 'Fields can only be edited while the stage is active.' using errcode = 'PT409';
  end if;

  if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    raise exception 'Provide at least one changed field.' using errcode = 'PT422';
  end if;

  -- Only declared fields exist; no arbitrary keys.
  for v_key in select jsonb_object_keys(v_patch) loop
    if not exists (
      select 1 from public.permission_types pt
      cross join lateral jsonb_array_elements(coalesce(pt.form_schema -> 'fields', '[]'::jsonb)) f
      where pt.id = v_request.permission_type_id and f ->> 'key' = v_key
    ) then
      raise exception 'Unknown form field "%".', v_key using errcode = 'PT422';
    end if;

    v_allowed := v_is_admin or v_key = any(coalesce(v_stage.can_edit_fields, '{}'));
    if not v_allowed then
      raise exception 'You are not allowed to edit "%".', v_key using errcode = 'PT403';
    end if;
  end loop;

  v_before := v_request.form_data;
  v_after := v_before || v_patch;
  perform public.validate_form_data(v_request.permission_type_id, v_after);

  v_material := public.material_fields(v_request.permission_type_id);
  select coalesce(array_agg(k), '{}') into v_changed
  from jsonb_object_keys(v_patch) k
  where k = any(v_material)
    and (v_before -> k) is distinct from (v_after -> k);

  update public.permission_requests set form_data = v_after where id = p_request_id;

  insert into public.request_revisions (
    request_id, actor_id, revision_type, before_data, after_data, reason
  ) values (
    p_request_id, p_actor, 'AUTHORITY_EDIT', v_before, v_after,
    coalesce(v_reason, 'Authority edit')
  );

  if cardinality(v_changed) = 0 then
    perform public.engine_action(
      p_request_id, v_state.id, p_actor, 'EDIT_REQUEST_BY_AUTHORITY',
      v_request.status, v_request.status,
      coalesce(v_reason, 'Authority edit'),
      jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(v_patch) k)),
      coalesce((p_payload ->> 'is_internal')::boolean, false)
    );
    perform public.notify_project_team(
      p_request_id, 'REQUEST_EDITED', 'Request updated',
      'An authority updated details on your request.', p_actor
    );
    return jsonb_build_object('ok', true, 'reapprovalRequired', false);
  end if;

  -- Which earlier approvals must be repeated?
  select coalesce(array_agg(ss.sequence), '{}')
  into v_invalid_seqs
  from public.request_stage_states ss
  join public.workflow_stages st on st.id = ss.stage_id
  where ss.request_id = p_request_id
    and ss.sequence < v_state.sequence
    and ss.status = 'APPROVED'
    and (
      cardinality(coalesce(st.invalidates_on, '{}')) = 0
      or st.invalidates_on && v_changed
    );

  if cardinality(v_invalid_seqs) = 0 then
    perform public.engine_action(
      p_request_id, v_state.id, p_actor, 'EDIT_REQUEST_BY_AUTHORITY',
      v_request.status, v_request.status,
      coalesce(v_reason, 'Authority edit'),
      jsonb_build_object('changed_fields', to_jsonb(v_changed)),
      coalesce((p_payload ->> 'is_internal')::boolean, false)
    );
    insert into public.request_revisions (
      request_id, actor_id, revision_type, before_data, after_data, reason
    ) values (
      p_request_id, p_actor, 'WORKFLOW_REVALIDATION',
      jsonb_build_object('reapprovalRequired', false, 'changedFields', v_changed),
      jsonb_build_object('reapprovalRequired', false),
      'Material change did not match any earlier stage invalidation rule.'
    );
    perform public.notify_project_team(
      p_request_id, 'REQUEST_EDITED', 'Request updated',
      format('An authority updated: %s. Earlier approvals remain valid.', array_to_string(v_changed, ', ')),
      p_actor
    );
    return jsonb_build_object('ok', true, 'reapprovalRequired', false, 'changedFields', v_changed);
  end if;

  v_earliest := (select min(s) from unnest(v_invalid_seqs) s);

  update public.request_stage_states
  set status = 'INVALIDATED',
      completed_at = null,
      assigned_approver_id = null,
      delegated_from_user_id = null,
      started_at = null,
      due_at = null,
      decision_comment = 'Superseded by a material change'
  where request_id = p_request_id
    and sequence >= v_earliest
    and sequence <= v_state.sequence
    and status in ('APPROVED', 'ACTIVE', 'WAITING_STUDENT');

  -- Skipped stages between the invalidation point and the current stage must be
  -- re-evaluated against the new data.
  update public.request_stage_states
  set status = 'PENDING', completed_at = null, decision_comment = null
  where request_id = p_request_id
    and sequence >= v_earliest
    and sequence < v_state.sequence
    and status = 'SKIPPED';

  update public.permission_requests
  set current_stage_id = null, status = 'UNDER_REVIEW'
  where id = p_request_id;

  insert into public.request_revisions (
    request_id, actor_id, revision_type, before_data, after_data, reason
  ) values (
    p_request_id, p_actor, 'WORKFLOW_REVALIDATION',
    jsonb_build_object('reapprovalRequired', false, 'changedFields', v_changed),
    jsonb_build_object(
      'reapprovalRequired', true,
      'changedFields', v_changed,
      'invalidatedSequences', v_invalid_seqs,
      'restartAtSequence', v_earliest
    ),
    coalesce(v_reason, 'Material change requires re-approval')
  );

  perform public.engine_action(
    p_request_id, v_state.id, p_actor, 'EDIT_REQUEST_BY_AUTHORITY',
    v_request.status, 'UNDER_REVIEW',
    coalesce(v_reason, 'Authority edit'),
    jsonb_build_object(
      'changed_fields', to_jsonb(v_changed),
      'reapproval_required', true,
      'invalidated_sequences', v_invalid_seqs
    ),
    coalesce((p_payload ->> 'is_internal')::boolean, false)
  );

  v_activated := public.activate_stage(p_request_id, (
    select id from public.request_stage_states
    where request_id = p_request_id and sequence >= v_earliest
      and status in ('PENDING', 'INVALIDATED')
    order by sequence asc limit 1
  ));

  perform public.notify_project_team(
    p_request_id, 'REAPPROVAL_REQUIRED', 'Re-approval required',
    format('Material changes were made: %s. Some approvals must be repeated.', array_to_string(v_changed, ', ')),
    p_actor
  );

  return jsonb_build_object(
    'ok', true,
    'reapprovalRequired', true,
    'changedFields', v_changed,
    'invalidatedSequences', v_invalid_seqs,
    'restarted', v_activated
  );
end;
$$;

-- FORWARD_STAGE -------------------------------------------------------------
create or replace function public.handle_forward_stage(
  p_request_id uuid,
  p_stage_state_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_state public.request_stage_states;
  v_target public.request_stage_states;
  v_target_stage public.workflow_stages;
  v_reason text := nullif(btrim(coalesce(p_comment, p_payload ->> 'reason', '')), '');
  v_target_id uuid := nullif(p_payload ->> 'targetStageStateId', '')::uuid;
  v_activated boolean;
begin
  perform public.engine_require_not_closed(v_request);

  if v_reason is null then
    raise exception 'A forwarding reason is required.' using errcode = 'PT422';
  end if;

  v_state := public.engine_resolve_stage(v_request, p_stage_state_id, p_actor);

  if v_state.status <> 'ACTIVE' then
    raise exception 'Only an active stage can be forwarded.' using errcode = 'PT409';
  end if;

  if v_target_id is null then
    raise exception 'Select the stage to forward to.' using errcode = 'PT422';
  end if;

  select * into v_target from public.request_stage_states
  where id = v_target_id and request_id = p_request_id
  for update;

  if v_target.id is null then
    raise exception 'Target stage not found on this request.' using errcode = 'PT404';
  end if;

  if v_target.sequence <= v_state.sequence then
    raise exception 'A request can only be forwarded to a later stage.' using errcode = 'PT422';
  end if;

  if v_target.status not in ('PENDING', 'INVALIDATED') then
    raise exception 'The target stage is not waiting (status: %).', v_target.status using errcode = 'PT409';
  end if;

  perform public.assert_required_documents(p_request_id);

  update public.request_stage_states
  set status = 'SKIPPED', completed_at = now(),
      decision_comment = 'Forwarded: ' || v_reason
  where id = v_state.id;

  update public.request_stage_states
  set status = 'SKIPPED', completed_at = now(),
      decision_comment = 'Skipped by forward'
  where request_id = p_request_id
    and sequence > v_state.sequence
    and sequence < v_target.sequence
    and status = 'PENDING';

  perform public.engine_action(
    p_request_id, v_state.id, p_actor, 'FORWARD_STAGE', 'ACTIVE', 'SKIPPED',
    v_reason, jsonb_build_object('target_stage_state_id', v_target.id),
    coalesce((p_payload ->> 'is_internal')::boolean, false)
  );

  v_activated := public.activate_stage(p_request_id, v_target.id);
  if not v_activated then
    update public.permission_requests
    set current_stage_id = null, status = 'UNDER_REVIEW'
    where id = p_request_id;
    return jsonb_build_object('ok', true, 'warning', 'MISSING_APPROVER');
  end if;

  perform public.notify_project_team(
    p_request_id, 'REQUEST_FORWARDED', 'Request forwarded',
    'Your request was forwarded to another approver.', p_actor
  );

  select * into v_target_stage from public.workflow_stages where id = v_target.stage_id;
  return jsonb_build_object('ok', true, 'forwardedTo', v_target_stage.name);
end;
$$;

-- DELEGATE_STAGE ------------------------------------------------------------
create or replace function public.handle_delegate_stage(
  p_request_id uuid,
  p_stage_state_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_state public.request_stage_states;
  v_delegate uuid := nullif(p_payload ->> 'delegateToUserId', '')::uuid;
  v_is_admin boolean := public.is_admin(p_actor);
  v_staff boolean;
begin
  perform public.engine_require_not_closed(v_request);
  v_state := public.engine_resolve_stage(v_request, p_stage_state_id, p_actor);

  if v_state.status <> 'ACTIVE' then
    raise exception 'Only an active stage can be delegated.' using errcode = 'PT409';
  end if;

  if v_delegate is null then
    raise exception 'Select a delegate.' using errcode = 'PT422';
  end if;

  if v_delegate = v_state.assigned_approver_id then
    raise exception 'This stage is already assigned to that user.' using errcode = 'PT409';
  end if;

  v_staff := public.has_role('faculty_guide', null, v_delegate)
    or public.has_role('department_head', null, v_delegate)
    or public.has_role('lab_manager', null, v_delegate)
    or public.has_role('dean', null, v_delegate)
    or public.is_admin(v_delegate);

  if not (v_is_admin or v_staff) then
    raise exception 'The delegate must hold an authority role.' using errcode = 'PT403';
  end if;

  update public.request_stage_states
  set assigned_approver_id = v_delegate,
      delegated_from_user_id = coalesce(delegated_from_user_id, v_state.assigned_approver_id),
      due_at = case
        when due_at is null then null
        else due_at
      end
  where id = v_state.id;

  perform public.engine_action(
    p_request_id, v_state.id, p_actor, 'DELEGATE_STAGE',
    'ACTIVE', 'ACTIVE',
    nullif(btrim(coalesce(p_comment, '')), ''),
    jsonb_build_object('delegate_to', v_delegate),
    coalesce((p_payload ->> 'is_internal')::boolean, false)
  );

  perform public.notify_user(
    v_delegate, p_request_id, 'STAGE_DELEGATED', 'Approval delegated to you',
    'A stage of a permission request was delegated to you.',
    '/requests/' || p_request_id::text
  );

  return jsonb_build_object('ok', true, 'assignedApproverId', v_delegate);
end;
$$;

-- WITHDRAW_REQUEST ----------------------------------------------------------
create or replace function public.handle_withdraw_request(
  p_request_id uuid,
  p_actor uuid,
  p_comment text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_actor_is_admin boolean := public.is_admin(p_actor);
  v_from text;
  v_reason text := nullif(btrim(coalesce(p_comment, p_payload ->> 'reason', '')), '');
begin
  if v_request.status in ('APPROVED', 'REJECTED', 'WITHDRAWN') then
    raise exception 'This request is % and cannot be withdrawn.', v_request.status using errcode = 'PT409';
  end if;

  if not (v_request.created_by = p_actor or v_actor_is_admin) then
    raise exception 'Only the request creator or an administrator can withdraw this request.' using errcode = 'PT403';
  end if;

  v_from := v_request.status;

  update public.request_stage_states
  set status = 'INVALIDATED', completed_at = now(),
      decision_comment = 'Request withdrawn'
  where request_id = p_request_id
    and status in ('ACTIVE', 'WAITING_STUDENT');

  update public.permission_requests
  set status = 'WITHDRAWN', withdrawn_at = now(), current_stage_id = null
  where id = p_request_id;

  perform public.engine_action(
    p_request_id, null, p_actor, 'WITHDRAW_REQUEST', v_from, 'WITHDRAWN',
    coalesce(v_reason, 'Withdrawn'), coalesce(p_payload, '{}'::jsonb), false
  );

  perform public.notify_project_team(
    p_request_id, 'REQUEST_WITHDRAWN', 'Request withdrawn',
    'The permission request was withdrawn.', p_actor
  );

  return jsonb_build_object('ok', true, 'status', 'WITHDRAWN');
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPC: single approval-action entry point
-- ---------------------------------------------------------------------------

create or replace function public.api_perform_action(
  p_request_id uuid,
  p_action text,
  p_stage_state_id uuid default null,
  p_comment text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_request public.permission_requests;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_action is null then
    raise exception 'Action is required.' using errcode = 'PT422';
  end if;

  v_request := public.engine_lock_request(p_request_id);

  if not public.can_view_request(p_request_id, v_actor) then
    raise exception 'You do not have access to this request.' using errcode = 'PT403';
  end if;

  case p_action
    when 'APPROVE_STAGE' then
      return public.handle_approve_stage(p_request_id, p_stage_state_id, v_actor, p_comment, v_payload);

    when 'REJECT_REQUEST' then
      return public.handle_reject_request(p_request_id, p_stage_state_id, v_actor, p_comment, v_payload);

    when 'REQUEST_CHANGES' then
      return public.handle_request_changes(p_request_id, p_stage_state_id, v_actor, p_comment, v_payload);

    when 'ASK_QUERY' then
      return public.handle_ask_query(p_request_id, p_stage_state_id, v_actor, p_comment, v_payload);

    when 'ANSWER_QUERY' then
      return public.handle_answer_query(p_request_id, v_actor, p_comment, v_payload);

    when 'RESUBMIT_REQUEST' then
      return public.handle_resubmit_request(p_request_id, v_actor, p_comment, v_payload);

    when 'EDIT_REQUEST_BY_AUTHORITY' then
      return public.handle_authority_edit(p_request_id, p_stage_state_id, v_actor, p_comment, v_payload);

    when 'FORWARD_STAGE' then
      return public.handle_forward_stage(p_request_id, p_stage_state_id, v_actor, p_comment, v_payload);

    when 'DELEGATE_STAGE' then
      return public.handle_delegate_stage(p_request_id, p_stage_state_id, v_actor, p_comment, v_payload);

    when 'WITHDRAW_REQUEST' then
      return public.handle_withdraw_request(p_request_id, v_actor, p_comment, v_payload);

    when 'SUBMIT_REQUEST' then
      raise exception 'Use submit_request() to submit a draft.' using errcode = 'PT422';

    when 'UPLOAD_DOCUMENT', 'REPLACE_DOCUMENT' then
      raise exception 'Upload documents through the document endpoint.' using errcode = 'PT422';

    when 'ISSUE_FINAL_PERMISSION' then
      raise exception 'Final permission is issued by the workflow engine.' using errcode = 'PT403';

    else
      raise exception 'Unknown action "%".', p_action using errcode = 'PT422';
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Request lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.api_create_request(p_project_id uuid, p_permission_type_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_project public.projects;
  v_type public.permission_types;
  v_template_id uuid;
  v_request_id uuid;
  v_stage public.workflow_stages;
begin
  select * into v_project from public.projects where id = p_project_id;
  if v_project.id is null then
    raise exception 'Project not found.' using errcode = 'PT404';
  end if;

  if not (public.is_project_member(p_project_id, v_actor) or v_project.created_by = v_actor or public.is_admin(v_actor)) then
    raise exception 'You are not a member of this project.' using errcode = 'PT403';
  end if;

  if v_project.status <> 'ACTIVE' then
    raise exception 'Permissions can only be requested for active projects.' using errcode = 'PT409';
  end if;

  select * into v_type from public.permission_types where id = p_permission_type_id;
  if v_type.id is null then
    raise exception 'Permission type not found.' using errcode = 'PT404';
  end if;
  if not v_type.is_active then
    raise exception 'This permission type is not available.' using errcode = 'PT409';
  end if;
  if v_type.department_id is not null and v_type.department_id <> v_project.department_id then
    raise exception 'This permission type is not available for your department.' using errcode = 'PT422';
  end if;

  select id into v_template_id
  from public.workflow_templates
  where permission_type_id = p_permission_type_id and is_active
  order by version desc
  limit 1;

  insert into public.permission_requests (
    project_id, permission_type_id, workflow_template_id, created_by, status, form_data
  ) values (
    p_project_id, p_permission_type_id, v_template_id, v_actor, 'DRAFT', '{}'::jsonb
  )
  returning id into v_request_id;

  if v_template_id is not null then
    for v_stage in
      select * from public.workflow_stages
      where template_id = v_template_id order by sequence asc
    loop
      insert into public.request_stage_states (
        request_id, stage_id, sequence, status
      ) values (
        v_request_id, v_stage.id, v_stage.sequence, 'PENDING'
      );
    end loop;
  end if;

  perform public.write_audit(
    v_actor, 'CREATE_REQUEST', 'permission_request', v_request_id,
    jsonb_build_object('project_id', p_project_id, 'permission_type_id', p_permission_type_id)
  );

  return v_request_id;
end;
$$;

create or replace function public.api_save_request_draft(p_request_id uuid, p_form_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_before jsonb;
begin
  if not public.can_edit_request_as_student(p_request_id, v_actor)
     and not public.is_admin(v_actor) then
    raise exception 'You are not allowed to edit this request.' using errcode = 'PT403';
  end if;

  if v_request.status not in ('DRAFT', 'CHANGES_REQUESTED') then
    raise exception 'Only drafts or requests awaiting changes can be edited.' using errcode = 'PT409';
  end if;

  if jsonb_typeof(p_form_data) <> 'object' then
    raise exception 'Form data must be an object.' using errcode = 'PT422';
  end if;

  perform public.validate_form_data(v_request.permission_type_id, p_form_data);
  v_before := v_request.form_data;

  if v_before = p_form_data then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update public.permission_requests set form_data = p_form_data where id = p_request_id;

  insert into public.request_revisions (
    request_id, actor_id, revision_type, before_data, after_data, reason
  ) values (
    p_request_id, v_actor, 'STUDENT_EDIT', v_before, p_form_data, 'Draft saved'
  );

  perform public.write_audit(v_actor, 'EDIT_REQUEST', 'permission_request', p_request_id, '{}'::jsonb);

  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

create or replace function public.api_submit_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_template public.workflow_templates;
  v_stage public.workflow_stages;
  v_first public.request_stage_states;
  v_check public.request_stage_states;
  v_approver uuid;
  v_result jsonb;
begin
  perform public.engine_require_not_closed(v_request);

  if not public.can_edit_request_as_student(p_request_id, v_actor) then
    raise exception 'You are not allowed to submit this request.' using errcode = 'PT403';
  end if;

  if v_request.status <> 'DRAFT' then
    raise exception 'Only a draft can be submitted.' using errcode = 'PT409';
  end if;

  perform public.validate_form_data(v_request.permission_type_id, v_request.form_data);

  if v_request.workflow_template_id is null then
    select * into v_template
    from public.workflow_templates
    where permission_type_id = v_request.permission_type_id and is_active
    order by version desc limit 1;

    if v_template.id is null then
      raise exception 'No active workflow template exists for this permission type.' using errcode = 'PT422';
    end if;

    update public.permission_requests
    set workflow_template_id = v_template.id
    where id = p_request_id;

    for v_stage in
      select * from public.workflow_stages where template_id = v_template.id order by sequence
    loop
      insert into public.request_stage_states (request_id, stage_id, sequence, status)
      values (p_request_id, v_stage.id, v_stage.sequence, 'PENDING')
      on conflict (request_id, stage_id) do nothing;
    end loop;

    v_request.workflow_template_id := v_template.id;
  end if;

  if not exists (select 1 from public.request_stage_states where request_id = p_request_id) then
    raise exception 'This workflow has no stages configured.' using errcode = 'PT422';
  end if;

  perform public.assert_required_documents(p_request_id);

  v_first := public.first_pending_stage(p_request_id);
  if v_first.id is null then
    raise exception 'There is no stage left to activate.' using errcode = 'PT409';
  end if;

  -- Find the first stage that will actually be activated (conditions may skip
  -- earlier stages). Refuse to submit when that stage has no active approver so
  -- the request cannot get stranded; admins are notified in this transaction.
  v_check := v_first;
  v_approver := null;
  while v_check.id is not null loop
    if public.stage_conditions_met(p_request_id, v_check.stage_id) then
      v_approver := public.resolve_approver(p_request_id, v_check.stage_id);
      exit;
    end if;
    v_check := public.next_pending_stage(p_request_id, v_check.sequence);
  end loop;

  if v_check.id is not null and v_approver is null then
    perform public.notify_admins(
      p_request_id, 'MISSING_APPROVER', 'Approver required',
      'A submitted request has no active approver for its first stage.'
    );
    perform public.write_audit(
      v_actor, 'SUBMIT_BLOCKED_MISSING_APPROVER', 'permission_request', p_request_id,
      jsonb_build_object('stage_id', v_check.stage_id)
    );
    return jsonb_build_object('ok', false, 'code', 'MISSING_APPROVER',
      'message', 'No active approver is configured for the first stage. An administrator has been notified.');
  end if;

  update public.permission_requests
  set status = 'SUBMITTED', submitted_at = now()
  where id = p_request_id;

  v_result := public.engine_advance_request(p_request_id, 0, v_actor);

  perform public.engine_action(
    p_request_id, null, v_actor, 'SUBMIT_REQUEST', 'DRAFT', 'UNDER_REVIEW', null, '{}'::jsonb
  );

  perform public.notify_project_team(
    p_request_id, 'REQUEST_SUBMITTED', 'Request submitted',
    'Your permission request has been submitted and routed for review.', v_actor
  );

  return jsonb_build_object('ok', true, 'status', 'UNDER_REVIEW', 'workflow', v_result);
end;
$$;

create or replace function public.api_withdraw_request(p_request_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
begin
  return public.handle_withdraw_request(p_request_id, v_actor, p_reason, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

create or replace function public.api_register_document(
  p_request_id uuid,
  p_required_document_type_id uuid,
  p_file_name text,
  p_mime_type text,
  p_size_bytes integer,
  p_storage_path text,
  p_replaces_document_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_doc_type public.required_document_types;
  v_old public.request_documents;
  v_new_id uuid;
  v_version integer;
  v_allowed_mime text[] := array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  v_max_bytes integer;
  v_approver uuid;
begin
  perform public.engine_require_not_closed(v_request);

  if not public.can_upload_documents(p_request_id, v_actor) then
    raise exception 'Documents can no longer be uploaded to this request.' using errcode = 'PT403';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'The uploaded file is empty.' using errcode = 'PT422';
  end if;

  if p_mime_type is null or not (p_mime_type = any(v_allowed_mime)) then
    raise exception 'Unsupported file type. Upload a PDF, PNG, JPEG or Word document.' using errcode = 'PT422';
  end if;

  if p_required_document_type_id is not null then
    select * into v_doc_type from public.required_document_types
    where id = p_required_document_type_id
      and permission_type_id = v_request.permission_type_id;

    if v_doc_type.id is null then
      raise exception 'This document type does not belong to the request.' using errcode = 'PT422';
    end if;
    v_max_bytes := v_doc_type.max_size_mb * 1024 * 1024;
  else
    v_max_bytes := 10 * 1024 * 1024;
  end if;

  if p_size_bytes > v_max_bytes then
    raise exception 'File is too large. Maximum size is % MB.', v_max_bytes / 1024 / 1024
      using errcode = 'PT422';
  end if;

  if p_file_name is null or btrim(p_file_name) = '' then
    raise exception 'A file name is required.' using errcode = 'PT422';
  end if;

  if p_storage_path is null
     or position('..' in p_storage_path) > 0
     or p_storage_path !~ ('^requests/' || p_request_id::text || '/') then
    raise exception 'Invalid storage path.' using errcode = 'PT422';
  end if;

  if p_replaces_document_id is not null then
    select * into v_old from public.request_documents
    where id = p_replaces_document_id and request_id = p_request_id
    for update;

    if v_old.id is null then
      raise exception 'Document to replace was not found.' using errcode = 'PT404';
    end if;
    if v_old.replaced_by is not null then
      raise exception 'This document has already been replaced.' using errcode = 'PT409';
    end if;
    if v_old.required_document_type_id is distinct from p_required_document_type_id then
      raise exception 'Replacement must use the same document type.' using errcode = 'PT422';
    end if;

    v_version := v_old.version + 1;
  else
    select coalesce(max(version), 0) + 1 into v_version
    from public.request_documents
    where request_id = p_request_id
      and required_document_type_id is not distinct from p_required_document_type_id;
  end if;

  insert into public.request_documents (
    request_id, required_document_type_id, file_name, mime_type,
    size_bytes, storage_path, version, uploaded_by
  ) values (
    p_request_id, p_required_document_type_id, p_file_name, p_mime_type,
    p_size_bytes, p_storage_path, v_version, v_actor
  )
  returning id into v_new_id;

  if v_old.id is not null then
    update public.request_documents set replaced_by = v_new_id where id = v_old.id;

    insert into public.request_revisions (
      request_id, actor_id, revision_type, before_data, after_data, reason
    ) values (
      p_request_id, v_actor, 'DOCUMENT_REPLACEMENT',
      jsonb_build_object('document_id', v_old.id, 'file_name', v_old.file_name, 'version', v_old.version),
      jsonb_build_object('document_id', v_new_id, 'file_name', p_file_name, 'version', v_version),
      'Document replaced'
    );
  end if;

  perform public.engine_action(
    p_request_id, null, v_actor,
    case when v_old.id is null then 'UPLOAD_DOCUMENT' else 'REPLACE_DOCUMENT' end,
    v_request.status, v_request.status, null,
    jsonb_build_object(
      'document_id', v_new_id,
      'file_name', p_file_name,
      'version', v_version,
      'replaced_document_id', v_old.id
    )
  );

  if v_request.status = 'UNDER_REVIEW' then
    select assigned_approver_id into v_approver
    from public.request_stage_states
    where id = v_request.current_stage_id;

    perform public.notify_user(
      v_approver,
      p_request_id, 'DOCUMENT_UPDATED', 'Document updated',
      'The student uploaded or replaced a document while under review.',
      '/requests/' || p_request_id::text
    );
  end if;

  return jsonb_build_object('ok', true, 'documentId', v_new_id, 'version', v_version);
end;
$$;

-- Notifications -------------------------------------------------------------

create or replace function public.api_mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
begin
  update public.notifications
  set read_at = now()
  where id = p_notification_id and user_id = v_actor and read_at is null;
end;
$$;

create or replace function public.api_mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_active_user();
begin
  update public.notifications set read_at = now()
  where user_id = v_actor and read_at is null;
end;
$$;

-- Admin recovery for stalled requests (no resolvable approver).
create or replace function public.api_admin_assign_stage(
  p_request_id uuid,
  p_stage_state_id uuid,
  p_approver_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.require_admin();
  v_request public.permission_requests := public.engine_lock_request(p_request_id);
  v_state public.request_stage_states;
  v_stage public.workflow_stages;
begin
  perform public.engine_require_not_closed(v_request);

  if not exists (select 1 from public.profiles where id = p_approver_id and is_active) then
    raise exception 'The selected approver is not an active user.' using errcode = 'PT422';
  end if;

  select * into v_state from public.request_stage_states
  where id = p_stage_state_id and request_id = p_request_id
  for update;

  if v_state.id is null then
    raise exception 'Stage not found on this request.' using errcode = 'PT404';
  end if;

  if v_state.status not in ('PENDING', 'INVALIDATED') then
    raise exception 'Only a pending stage can be assigned.' using errcode = 'PT409';
  end if;

  select * into v_stage from public.workflow_stages where id = v_state.stage_id;

  if exists (
    select 1 from public.request_stage_states ss
    where ss.request_id = p_request_id
      and ss.sequence < v_state.sequence
      and ss.status not in ('APPROVED', 'SKIPPED')
  ) then
    raise exception 'Earlier stages must be completed first.' using errcode = 'PT409';
  end if;

  update public.request_stage_states
  set status = 'ACTIVE',
      assigned_approver_id = p_approver_id,
      started_at = now(),
      due_at = case when v_stage.sla_hours is null then null
                    else now() + make_interval(hours => v_stage.sla_hours) end
  where id = v_state.id;

  update public.permission_requests
  set status = 'UNDER_REVIEW', current_stage_id = v_state.id
  where id = p_request_id;

  perform public.engine_action(
    p_request_id, v_state.id, v_actor, 'DELEGATE_STAGE',
    v_request.status, 'UNDER_REVIEW',
    coalesce(p_reason, 'Assigned by administrator'),
    jsonb_build_object('assigned_approver_id', p_approver_id, 'admin_assignment', true)
  );

  perform public.notify_user(
    p_approver_id, p_request_id, 'NEW_APPROVAL_TASK', 'New approval request',
    'An administrator assigned a permission request to you.',
    '/requests/' || p_request_id::text
  );

  return jsonb_build_object('ok', true, 'assignedApproverId', p_approver_id);
end;
$$;
