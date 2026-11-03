import "server-only";
import { createClient, callRpc } from "@/lib/supabase/server";
import {
  demoActor,
  demoAnalytics,
  demoAssignStage,
  demoCountsFor,
  demoCreateRequest,
  demoInboxFor,
  demoMyRequests,
  demoOverdueFor,
  demoPerformAction,
  demoRequestDetail,
  demoRequestsFor,
  demoSaveDraft,
  demoSubmitRequest,
  demoUploadDocument,
  demoVerifyDocument,
  demoWithdrawRequest,
  getDemoSession,
  isDemoId,
} from "@/lib/demo";
import type {
  ApprovalAction,
  PermissionRequest,
  PermissionType,
  Project,
  QueryRow,
  RequestDocument,
  RequestRevision,
  RequestStageState,
  RequiredDocumentType,
  WorkflowTemplate,
} from "@/lib/types";

export interface RequestSummary {
  id: string;
  status: PermissionRequest["status"];
  project_id: string;
  project_title: string;
  permission_type_id: string;
  permission_type_name: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  current_stage_name: string | null;
  current_sequence: number | null;
  stage_count: number;
  assigned_approver_name: string | null;
  due_at: string | null;
}

interface StageMeta {
  id: string;
  request_id: string;
  stage_id: string;
  sequence: number;
  status: RequestStageState["status"];
  assigned_approver_id: string | null;
  due_at: string | null;
  workflow_stages: { name: string } | { name: string }[] | null;
}

function single<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function hydrateSummaries(
  rows: Array<Record<string, any>>
): Promise<RequestSummary[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const ids = rows.map((row) => row.id);

  const { data: stageRows } = await supabase
    .from("request_stage_states")
    .select(
      "id, request_id, stage_id, sequence, status, assigned_approver_id, due_at, workflow_stages(name)"
    )
    .in("request_id", ids)
    .order("sequence", { ascending: true });

  const stages = (stageRows ?? []) as unknown as StageMeta[];
  const approverIds = Array.from(
    new Set(stages.map((stage) => stage.assigned_approver_id).filter((id): id is string => Boolean(id)))
  );

  let approverNames = new Map<string, string>();
  if (approverIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", approverIds);
    approverNames = new Map(((profiles ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
  }

  return rows.map((row) => {
    const requestStages = stages.filter((stage) => stage.request_id === row.id);
    const current =
      requestStages.find((stage) => stage.id === row.current_stage_id) ??
      requestStages.find((stage) => stage.status === "ACTIVE") ??
      null;
    const stageName = single(current?.workflow_stages)?.name ?? null;

    return {
      id: row.id,
      status: row.status,
      project_id: row.project_id,
      project_title: single(row.projects)?.title ?? "Project",
      permission_type_id: row.permission_type_id,
      permission_type_name: single(row.permission_types)?.name ?? "Permission",
      created_at: row.created_at,
      updated_at: row.updated_at,
      submitted_at: row.submitted_at,
      current_stage_name: stageName,
      current_sequence: current?.sequence ?? null,
      stage_count: requestStages.length,
      assigned_approver_name: current?.assigned_approver_id
        ? approverNames.get(current.assigned_approver_id) ?? null
        : null,
      due_at: current?.due_at ?? null,
    };
  });
}

const SUMMARY_SELECT = "id, status, project_id, permission_type_id, created_by, created_at, updated_at, submitted_at, current_stage_id, projects(title), permission_types(name)";

export async function listMyRequests(viewerId: string, limit = 50): Promise<RequestSummary[]> {
  const demoRole = await getDemoSession();
  if (demoRole || isDemoId(viewerId)) return demoMyRequests(viewerId, limit);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permission_requests")
    .select(SUMMARY_SELECT)
    .eq("created_by", viewerId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return hydrateSummaries((data ?? []) as Array<Record<string, any>>);
}

/**
 * Requests the viewer can see as a student: ones they created plus ones that
 * belong to projects they are a member of. Row-level security still applies.
 */
export async function listPortfolioRequests(
  viewerId: string,
  options: { status?: string; limit?: number } = {}
): Promise<RequestSummary[]> {
  const demoRole = await getDemoSession();
  if (demoRole) {
    const rows = demoRequestsFor(demoRole);
    return (options.status ? rows.filter((row) => row.status === options.status) : rows).slice(
      0,
      options.limit ?? 200
    );
  }

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", viewerId);

  const projectIds = ((memberships ?? []) as Array<{ project_id: string }>).map(
    (row) => row.project_id
  );

  let query = supabase
    .from("permission_requests")
    .select(SUMMARY_SELECT)
    .order("updated_at", { ascending: false })
    .limit(options.limit ?? 200);

  query = projectIds.length
    ? query.or(`created_by.eq.${viewerId},project_id.in.(${projectIds.join(",")})`)
    : query.eq("created_by", viewerId);

  if (options.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) throw error;
  return hydrateSummaries((data ?? []) as Array<Record<string, any>>);
}

export async function listProjectRequests(projectId: string): Promise<RequestSummary[]> {
  const demoRole = await getDemoSession();
  if (demoRole || isDemoId(projectId)) {
    return demoRequestsFor(demoRole ?? "student").filter((row) => row.project_id === projectId);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permission_requests")
    .select(SUMMARY_SELECT)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return hydrateSummaries((data ?? []) as Array<Record<string, any>>);
}

export async function listAllRequests(options: {
  status?: string;
  permissionTypeId?: string;
  limit?: number;
} = {}): Promise<RequestSummary[]> {
  const demoRole = await getDemoSession();
  if (demoRole) {
    const rows = demoRequestsFor(demoRole);
    return (options.status ? rows.filter((row) => row.status === options.status) : rows).slice(
      0,
      options.limit ?? 200
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("permission_requests")
    .select(SUMMARY_SELECT)
    .order("updated_at", { ascending: false })
    .limit(options.limit ?? 200);

  if (options.status) query = query.eq("status", options.status);
  if (options.permissionTypeId) query = query.eq("permission_type_id", options.permissionTypeId);

  const { data, error } = await query;
  if (error) throw error;
  return hydrateSummaries((data ?? []) as Array<Record<string, any>>);
}

async function summariesByIds(ids: string[]): Promise<RequestSummary[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permission_requests")
    .select(SUMMARY_SELECT)
    .in("id", ids);
  if (error) throw error;
  const summaries = await hydrateSummaries((data ?? []) as Array<Record<string, any>>);
  return ids
    .map((id) => summaries.find((summary) => summary.id === id))
    .filter((summary): summary is RequestSummary => Boolean(summary));
}

export async function listApprovalInbox(viewerId: string): Promise<RequestSummary[]> {
  const demoRole = await getDemoSession();
  if (demoRole) return demoInboxFor(demoRole);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("request_stage_states")
    .select("request_id, due_at")
    .eq("assigned_approver_id", viewerId)
    .eq("status", "ACTIVE")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) throw error;
  return summariesByIds(((data ?? []) as Array<{ request_id: string }>).map((row) => row.request_id));
}

export async function listOverdueApprovals(viewerId: string): Promise<RequestSummary[]> {
  const demoRole = await getDemoSession();
  if (demoRole || isDemoId(viewerId)) return demoOverdueFor(demoRole ?? "student");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("request_stage_states")
    .select("request_id, due_at")
    .eq("assigned_approver_id", viewerId)
    .eq("status", "ACTIVE")
    .lt("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(100);

  if (error) throw error;
  return summariesByIds(((data ?? []) as Array<{ request_id: string }>).map((row) => row.request_id));
}

export async function listCompletedReviews(viewerId: string, limit = 50): Promise<RequestSummary[]> {
  const demoRole = await getDemoSession();
  if (demoRole) {
    return demoRequestsFor(demoRole)
      .filter((row) => row.status === "APPROVED" || row.status === "REJECTED")
      .slice(0, limit);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approval_actions")
    .select("request_id, created_at")
    .eq("actor_id", viewerId)
    .in("action", ["APPROVE_STAGE", "REJECT_REQUEST", "REQUEST_CHANGES", "ISSUE_FINAL_PERMISSION"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const ids = Array.from(new Set(((data ?? []) as Array<{ request_id: string }>).map((row) => row.request_id)));
  return summariesByIds(ids);
}

export interface WorkflowCounts {
  inbox: number;
  overdue: number;
  completed: number;
  unreadNotifications: number;
}

export async function getWorkflowCounts(viewerId: string): Promise<WorkflowCounts> {
  const demoRole = await getDemoSession();
  if (demoRole) return demoCountsFor(demoRole);

  const supabase = await createClient();
  const now = new Date().toISOString();

  const [inbox, overdue, completed, notifications] = await Promise.all([
    supabase
      .from("request_stage_states")
      .select("id", { count: "exact", head: true })
      .eq("assigned_approver_id", viewerId)
      .eq("status", "ACTIVE"),
    supabase
      .from("request_stage_states")
      .select("id", { count: "exact", head: true })
      .eq("assigned_approver_id", viewerId)
      .eq("status", "ACTIVE")
      .lt("due_at", now),
    supabase
      .from("approval_actions")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", viewerId)
      .in("action", ["APPROVE_STAGE", "REJECT_REQUEST", "REQUEST_CHANGES"]),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewerId)
      .is("read_at", null),
  ]);

  return {
    inbox: inbox.count ?? 0,
    overdue: overdue.count ?? 0,
    completed: completed.count ?? 0,
    unreadNotifications: notifications.count ?? 0,
  };
}

export interface RequestDetail {
  request: PermissionRequest;
  project: (Project & { departments?: { name: string } | null }) | null;
  permissionType: PermissionType | null;
  template: (WorkflowTemplate & { workflow_stages?: unknown[] }) | null;
  stages: Array<RequestStageState & { workflow_stages?: { name: string } | null }>;
  actions: ApprovalAction[];
  documents: Array<RequestDocument & { required_document_types?: { name: string } | null }>;
  requiredDocumentTypes: RequiredDocumentType[];
  queries: QueryRow[];
  revisions: RequestRevision[];
  members: Array<{ user_id: string; role: string; profiles?: { name: string; email: string } | null }>;
  actors: Record<string, { name: string; email: string }>;
  teamProfiles: Record<string, { name: string; email: string }>;
}

export async function getRequestDetail(id: string): Promise<RequestDetail | null> {
  const demoRole = await getDemoSession().catch(() => null);
  if (demoRole || isDemoId(id)) {
    const detail = demoRequestDetail(id);
    if (!detail) return null;
    return detail as unknown as RequestDetail;
  }

  const supabase = await createClient();

  const { data: requestData, error } = await supabase
    .from("permission_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!requestData) return null;

  const request = requestData as unknown as PermissionRequest;

  const [
    projectResult,
    typeResult,
    stagesResult,
    actionsResult,
    documentsResult,
    docTypesResult,
    queriesResult,
    revisionsResult,
    membersResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*, departments(name)")
      .eq("id", request.project_id)
      .maybeSingle(),
    supabase.from("permission_types").select("*").eq("id", request.permission_type_id).maybeSingle(),
    supabase
      .from("request_stage_states")
      .select("*, workflow_stages(*)")
      .eq("request_id", id)
      .order("sequence", { ascending: true }),
    supabase
      .from("approval_actions")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("request_documents")
      .select("*, required_document_types(name)")
      .eq("request_id", id)
      .order("version", { ascending: false }),
    supabase
      .from("required_document_types")
      .select("*")
      .eq("permission_type_id", request.permission_type_id)
      .order("name"),
    supabase
      .from("queries")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("request_revisions")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_members")
      .select("user_id, role, profiles:profiles!project_members_user_id_fkey(name, email)")
      .eq("project_id", request.project_id),
  ]);

  for (const result of [
    projectResult,
    typeResult,
    stagesResult,
    actionsResult,
    documentsResult,
    docTypesResult,
    queriesResult,
    revisionsResult,
    membersResult,
  ]) {
    if (result.error) throw result.error;
  }

  const teamProfiles: Record<string, { name: string; email: string }> = {};
  const members = ((membersResult.data ?? []) as unknown as RequestDetail["members"]).map((member) => {
    if (member.profiles) teamProfiles[member.user_id] = member.profiles;
    return member;
  });

  const actions = (actionsResult.data ?? []) as unknown as ApprovalAction[];
  const queries = (queriesResult.data ?? []) as unknown as QueryRow[];
  const revisions = (revisionsResult.data ?? []) as unknown as RequestRevision[];
  const documents = (documentsResult.data ?? []) as unknown as RequestDetail["documents"];

  const actorIds = Array.from(
    new Set(
      [
        ...actions.map((action) => action.actor_id),
        ...queries.map((query) => query.asked_by),
        ...queries.map((query) => query.responded_by),
        ...revisions.map((revision) => revision.actor_id),
        ...documents.map((document) => document.uploaded_by),
        ...((stagesResult.data ?? []) as unknown as RequestStageState[]).map((stage) => stage.assigned_approver_id),
        ...((stagesResult.data ?? []) as unknown as RequestStageState[]).map((stage) => stage.delegated_from_user_id),
      ].filter((value): value is string => Boolean(value))
    )
  );

  const actors: Record<string, { name: string; email: string }> = {};
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", actorIds);
    for (const profile of (profiles ?? []) as Array<{ id: string; name: string; email: string }>) {
      actors[profile.id] = { name: profile.name, email: profile.email };
    }
  }

  // Merge team profile names so we can label creators even if they have no action.
  for (const [userId, profile] of Object.entries(teamProfiles)) {
    actors[userId] ??= profile;
  }

  return {
    request,
    project: (projectResult.data ?? null) as unknown as RequestDetail["project"],
    permissionType: (typeResult.data ?? null) as unknown as PermissionType | null,
    template: null,
    stages: (stagesResult.data ?? []) as unknown as RequestDetail["stages"],
    actions,
    documents,
    requiredDocumentTypes: (docTypesResult.data ?? []) as unknown as RequiredDocumentType[],
    queries,
    revisions,
    members,
    actors,
    teamProfiles,
  };
}

// ---------------------------------------------------------------------------
// Mutations (all authorization happens inside Postgres)
// ---------------------------------------------------------------------------

export async function createRequest(projectId: string, permissionTypeId: string) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(projectId)) {
    return demoCreateRequest(projectId, permissionTypeId);
  }
  return callRpc<string>("api_create_request", {
    p_project_id: projectId,
    p_permission_type_id: permissionTypeId,
  });
}

export async function saveDraft(requestId: string, formData: Record<string, unknown>) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(requestId)) {
    return demoSaveDraft(requestId, formData);
  }
  return callRpc<{ ok: boolean; changed: boolean }>("api_save_request_draft", {
    p_request_id: requestId,
    p_form_data: formData,
  });
}

export async function submitRequest(requestId: string) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(requestId)) {
    return demoSubmitRequest(requestId);
  }
  return callRpc<{ ok: boolean; status?: string; code?: string; message?: string }>(
    "api_submit_request",
    { p_request_id: requestId }
  );
}

export async function withdrawRequest(requestId: string, reason?: string) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(requestId)) {
    return demoWithdrawRequest(requestId, reason);
  }
  return callRpc<{ ok: boolean; status: string }>("api_withdraw_request", {
    p_request_id: requestId,
    p_reason: reason ?? null,
  });
}

export async function performRequestAction(input: {
  requestId: string;
  action: string;
  stageStateId?: string | null;
  comment?: string | null;
  payload?: Record<string, unknown>;
}) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(input.requestId)) {
    return demoPerformAction(input);
  }
  return callRpc<Record<string, unknown>>("api_perform_action", {
    p_request_id: input.requestId,
    p_action: input.action,
    p_stage_state_id: input.stageStateId ?? null,
    p_comment: input.comment ?? null,
    p_payload: input.payload ?? {},
  });
}

export async function assignStage(
  requestId: string,
  stageStateId: string,
  approverId: string,
  reason?: string
) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(requestId)) {
    return demoAssignStage(requestId, stageStateId, approverId, reason);
  }
  return callRpc<{ ok: boolean }>("api_admin_assign_stage", {
    p_request_id: requestId,
    p_stage_state_id: stageStateId,
    p_approver_id: approverId,
    p_reason: reason ?? null,
  });
}

export async function verifyDocument(documentId: string, status: "PENDING" | "VERIFIED" | "REJECTED") {
  if ((await getDemoSession().catch(() => null)) || isDemoId(documentId)) {
    return demoVerifyDocument(documentId, status);
  }
  return callRpc<void>("api_verify_document", {
    p_document_id: documentId,
    p_status: status,
  });
}
