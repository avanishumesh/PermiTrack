import "server-only";
import { randomBytes } from "node:crypto";
import { AppError, mapDbError } from "@/lib/errors";
import { getApiAdmin } from "@/lib/auth";
import { demoAdminOverview, demoAnalytics, demoUsers, getDemoSession, DEMO_IDS } from "@/lib/demo";
import { callRpc, createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditLog, Department, PermissionType } from "@/lib/types";
import type { WorkflowInput } from "@/lib/validation/schemas";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  department_id: string | null;
  department_name: string | null;
  is_active: boolean;
  created_at: string;
  roles: Array<{
    id: string;
    role_id: string;
    role_name: string;
    department_id: string | null;
  }>;
}

interface RoleOption {
  id: string;
  name: string;
  description: string | null;
}

function inWindow(row: {
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}) {
  if (!row.is_active) return false;
  const now = Date.now();
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return false;
  return true;
}

export async function listRoles(): Promise<RoleOption[]> {
  if (await getDemoSession().catch(() => null)) {
    return [
      { id: "demo-role-admin", name: "admin", description: "Administrator" },
      { id: "demo-role-guide", name: "faculty_guide", description: "Faculty guide" },
      { id: "demo-role-hod", name: "department_head", description: "Department head" },
      { id: "demo-role-student", name: "student", description: "Student" },
    ];
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").select("id, name, description").order("name");
  if (error) throw mapDbError(error);
  return (data ?? []) as RoleOption[];
}

export async function listUsers(): Promise<AdminUser[]> {
  if (await getDemoSession().catch(() => null)) return demoUsers() as AdminUser[];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, name, email, department_id, is_active, created_at, departments(name), user_roles(id, role_id, department_id, is_active, starts_at, ends_at, roles(name))"
    )
    .order("name");

  if (error) throw mapDbError(error);

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    department_id: row.department_id,
    department_name: row.departments?.name ?? null,
    is_active: row.is_active,
    created_at: row.created_at,
    roles: ((row.user_roles ?? []) as Array<Record<string, any>>)
      .filter(inWindow)
      .map((assignment) => ({
        id: assignment.id,
        role_id: assignment.role_id,
        role_name: Array.isArray(assignment.roles)
          ? assignment.roles[0]?.name ?? "—"
          : assignment.roles?.name ?? "—",
        department_id: assignment.department_id,
      })),
  }));
}

export async function createUser(input: {
  name: string;
  email: string;
  password?: string;
  departmentId: string | null;
  roles: Array<{ roleId: string; departmentId: string | null }>;
}) {
  const admin = await getApiAdmin();
  const service = createAdminClient();

  const password = input.password?.trim() || randomBytes(12).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });

  if (error || !data.user) {
    throw new AppError(
      "CREATE_USER_FAILED",
      error?.message?.includes("already")
        ? "A user with that email already exists."
        : "The user could not be created.",
      400
    );
  }

  const userId = data.user.id;

  try {
    await callRpc<void>("api_admin_update_profile", {
      p_user_id: userId,
      p_name: input.name,
      p_department_id: input.departmentId,
      p_is_active: true,
    });

    await callRpc<void>("api_admin_set_user_roles", {
      p_user_id: userId,
      p_roles: input.roles,
    });
  } catch (error) {
    // Do not leave a half-configured account behind.
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
    throw mapDbError(error);
  }

  return { userId, temporaryPassword: input.password ? null : password, createdBy: admin.user.id };
}

export async function updateUser(input: {
  userId: string;
  name: string;
  departmentId: string | null;
  isActive: boolean;
}) {
  await callRpc<void>("api_admin_update_profile", {
    p_user_id: input.userId,
    p_name: input.name,
    p_department_id: input.departmentId,
    p_is_active: input.isActive,
  });
}

export async function setUserRoles(
  userId: string,
  roles: Array<{ roleId: string; departmentId: string | null }>
) {
  await callRpc<void>("api_admin_set_user_roles", {
    p_user_id: userId,
    p_roles: roles,
  });
}

export async function listDepartments(): Promise<Department[]> {
  if (await getDemoSession().catch(() => null)) {
    return [
      { id: DEMO_IDS.deptCS, name: "Computer Science", parent_id: null, head_user_id: DEMO_IDS.head, created_at: new Date().toISOString() },
    ];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, parent_id, head_user_id, created_at")
    .order("name");
  if (error) throw mapDbError(error);
  return (data ?? []) as Department[];
}

export async function upsertDepartment(input: {
  id?: string | null;
  name: string;
  parentId: string | null;
  headUserId: string | null;
}) {
  return callRpc<string>("api_admin_upsert_department", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_parent_id: input.parentId,
    p_head_user_id: input.headUserId,
  });
}

// ---------------------------------------------------------------------------
// Catalogue administration
// ---------------------------------------------------------------------------

export async function savePermissionType(input: {
  id?: string | null;
  name: string;
  description?: string;
  departmentId: string | null;
  isActive: boolean;
  formSchema: PermissionType["form_schema"];
  eligibilityRules?: Record<string, unknown> | null;
}) {
  return callRpc<string>("api_admin_save_permission_type", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_description: input.description ?? null,
    p_department_id: input.departmentId,
    p_form_schema: input.formSchema,
    p_eligibility_rules: input.eligibilityRules ?? null,
    p_is_active: input.isActive,
  });
}

export async function saveDocumentType(input: {
  id?: string | null;
  permissionTypeId: string;
  name: string;
  description?: string;
  isRequired: boolean;
  acceptedMimeTypes: string[];
  maxSizeMb: number;
}) {
  return callRpc<string>("api_admin_save_document_type", {
    p_id: input.id ?? null,
    p_permission_type_id: input.permissionTypeId,
    p_name: input.name,
    p_description: input.description ?? null,
    p_is_required: input.isRequired,
    p_accepted_mime_types: input.acceptedMimeTypes,
    p_max_size_mb: input.maxSizeMb,
  });
}

export async function deleteDocumentType(id: string) {
  await callRpc<void>("api_admin_delete_document_type", { p_id: id });
}

// ---------------------------------------------------------------------------
// Workflow administration
// ---------------------------------------------------------------------------

function stagesPayload(workflow: WorkflowInput) {
  return workflow.stages.map((stage, index) => ({
    sequence: stage.sequence ?? index + 1,
    name: stage.name,
    approverType: stage.approverType,
    approverRoleId: stage.approverRoleId ?? null,
    approverUserId: stage.approverUserId ?? null,
    departmentScope: stage.departmentScope,
    canEditFields: stage.canEditFields,
    invalidatesOn: stage.invalidatesOn,
    slaHours: stage.slaHours ?? null,
    conditions: stage.conditions ?? null,
  }));
}

export async function createWorkflowTemplate(workflow: WorkflowInput) {
  return callRpc<string>("api_admin_create_workflow_template", {
    p_permission_type_id: workflow.permissionTypeId,
    p_name: workflow.name,
    p_stages: stagesPayload(workflow),
  });
}

export async function updateWorkflowDraft(workflow: WorkflowInput) {
  if (!workflow.id) throw new AppError("PT422", "A workflow id is required.", 422);
  await callRpc<void>("api_admin_update_workflow_draft", {
    p_template_id: workflow.id,
    p_name: workflow.name,
    p_stages: stagesPayload(workflow),
  });
}

export async function publishWorkflowTemplate(templateId: string) {
  await callRpc<void>("api_admin_publish_workflow_template", { p_template_id: templateId });
}

export async function deactivateWorkflowTemplate(templateId: string) {
  await callRpc<void>("api_admin_deactivate_workflow_template", { p_template_id: templateId });
}

// ---------------------------------------------------------------------------
// Monitoring, analytics, audit
// ---------------------------------------------------------------------------

export interface AdminAnalytics {
  generatedAt: string;
  totalRequests: number;
  byStatus: Record<string, number>;
  pendingApprovals: number;
  overdueApprovals: number;
  stalledRequests: number;
  averageStageHours: Array<{
    stage: string;
    permission_type: string;
    completed: number;
    avg_hours: number;
  }>;
  bottlenecks: Array<{
    stage: string;
    permission_type: string;
    active: number;
    overdue: number;
  }>;
  recentActions: Array<{
    id: string;
    action: string;
    created_at: string;
    request_id: string;
    actor_name: string;
    permission_type: string;
  }>;
  weeklyVolume: Array<{ week: string; requests: number }>;
}

export async function getAnalytics(): Promise<AdminAnalytics> {
  if (await getDemoSession().catch(() => null)) {
    return demoAnalytics() as AdminAnalytics;
  }
  return callRpc<AdminAnalytics>("api_admin_analytics");
}

export async function listAuditLogs(options: {
  action?: string;
  entityType?: string;
  limit?: number;
} = {}): Promise<AuditLog[]> {
  if (await getDemoSession().catch(() => null)) return [];
  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);

  if (options.action) query = query.eq("action", options.action);
  if (options.entityType) query = query.eq("entity_type", options.entityType);

  const { data, error } = await query;
  if (error) throw mapDbError(error);
  return (data ?? []) as AuditLog[];
}

export async function getAdminOverview() {
  if (await getDemoSession().catch(() => null)) return demoAdminOverview();

  await getApiAdmin();
  const supabase = await createClient();
  const [users, activeUsers, requests, pending, roles] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("permission_requests").select("id", { count: "exact", head: true }),
    supabase.from("request_stage_states").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    supabase.from("roles").select("id, name, description").order("name"),
  ]);

  return {
    totalUsers: users.count ?? 0,
    activeUsers: activeUsers.count ?? 0,
    totalRequests: requests.count ?? 0,
    pendingApprovals: pending.count ?? 0,
    roles: (roles.data ?? []) as RoleOption[],
  };
}
