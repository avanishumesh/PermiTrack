import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  demoPermissionTypeDetail,
  demoPermissionTypes,
  demoWorkflowTemplate,
  getDemoSession,
  isDemoId,
} from "@/lib/demo";
import type { PermissionType, RequiredDocumentType } from "@/lib/types";

export interface PermissionTypeSummary {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  department_name: string | null;
  is_active: boolean;
  field_count: number;
  document_count: number;
  workflow_version: number | null;
  workflow_active: boolean;
  updated_at: string;
}

export async function listPermissionTypes(options: { includeInactive?: boolean } = {}) {
  if (await getDemoSession().catch(() => null)) return demoPermissionTypes();
  const supabase = await createClient();
  let query = supabase
    .from("permission_types")
    .select("*, departments(name), required_document_types(id,is_required), workflow_templates(version,is_active)")
    .order("name");

  if (!options.includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, any>>).map((row): PermissionTypeSummary => {
    const workflows = (row.workflow_templates ?? []) as Array<{ version: number; is_active: boolean }>;
    const active = workflows.find((workflow) => workflow.is_active);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      department_id: row.department_id,
      department_name: row.departments?.name ?? null,
      is_active: row.is_active,
      field_count: (row.form_schema?.fields ?? []).length,
      document_count: (row.required_document_types ?? []).length,
      workflow_version: active?.version ?? (workflows[0]?.version ?? null),
      workflow_active: Boolean(active),
      updated_at: row.updated_at,
    };
  });
}

export async function getPermissionTypeDetail(id: string) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(id)) {
    return demoPermissionTypeDetail();
  }
  const supabase = await createClient();
  const [{ data: type, error }, { data: docs, error: docsError }, { data: workflows, error: workflowError }] =
    await Promise.all([
      supabase.from("permission_types").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("required_document_types")
        .select("*")
        .eq("permission_type_id", id)
        .order("name"),
      supabase
        .from("workflow_templates")
        .select("*, workflow_stages(*, roles(name), approver:profiles!workflow_stages_approver_user_id_fkey(name))")
        .eq("permission_type_id", id)
        .order("version", { ascending: false }),
    ]);

  if (error) throw error;
  if (docsError) throw docsError;
  if (workflowError) throw workflowError;

  if (!type) return null;

  return {
    permissionType: type as unknown as PermissionType,
    documents: (docs ?? []) as RequiredDocumentType[],
    workflows: (workflows ?? []) as any[],
  };
}

export async function listPermissionTypeOptions() {
  if (await getDemoSession().catch(() => null)) {
    const type = demoPermissionTypeDetail().permissionType;
    return [
      {
        id: type.id,
        name: type.name,
        description: type.description,
        department_id: type.department_id,
        form_schema: type.form_schema,
      },
    ];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permission_types")
    .select("id, name, description, department_id, form_schema")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    department_id: string | null;
    form_schema: PermissionType["form_schema"];
  }>;
}

export interface WorkflowSummary {
  id: string;
  permission_type_id: string;
  permission_type_name: string;
  name: string;
  version: number;
  is_active: boolean;
  stage_count: number;
  request_count: number;
  created_at: string;
  stages: Array<{
    id: string;
    sequence: number;
    name: string;
    approver_type: string;
    approver_role_id: string | null;
    approver_user_id: string | null;
    sla_hours: number | null;
    can_edit_fields: string[];
    invalidates_on: string[];
    department_scope: string;
    conditions: Record<string, unknown> | null;
  }>;
}

export async function listWorkflowTemplates(): Promise<WorkflowSummary[]> {
  if (await getDemoSession().catch(() => null)) return [demoWorkflowTemplate()] as WorkflowSummary[];
  const supabase = await createClient();
  const [{ data, error }, { data: usage, error: usageError }] = await Promise.all([
    supabase
      .from("workflow_templates")
      .select("*, permission_types(name), workflow_stages(*)")
      .order("created_at", { ascending: false }),
    supabase.from("permission_requests").select("workflow_template_id").not("workflow_template_id", "is", null),
  ]);

  if (error) throw error;
  if (usageError) throw usageError;

  const counts = ((usage ?? []) as Array<{ workflow_template_id: string | null }>).reduce<
    Record<string, number>
  >((acc, row) => {
    if (row.workflow_template_id) acc[row.workflow_template_id] = (acc[row.workflow_template_id] ?? 0) + 1;
    return acc;
  }, {});

  return ((data ?? []) as Array<Record<string, any>>)
    .map((row) => ({
      id: row.id,
      permission_type_id: row.permission_type_id,
      permission_type_name: row.permission_types?.name ?? "—",
      name: row.name,
      version: row.version,
      is_active: row.is_active,
      stage_count: (row.workflow_stages ?? []).length,
      request_count: counts[row.id] ?? 0,
      created_at: row.created_at,
      stages: ((row.workflow_stages ?? []) as any[])
        .slice()
        .sort((a, b) => a.sequence - b.sequence),
    }))
    .sort((a, b) => a.permission_type_name.localeCompare(b.permission_type_name) || b.version - a.version);
}

export async function listRoles() {
  if (await getDemoSession().catch(() => null)) {
    const rid = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    return [
      { id: rid(901), name: "admin", description: "Administrator" },
      { id: rid(902), name: "faculty_guide", description: "Faculty guide" },
      { id: rid(903), name: "department_head", description: "Department head" },
      { id: rid(904), name: "lab_manager", description: "Lab manager" },
      { id: rid(905), name: "dean", description: "Dean" },
      { id: rid(906), name: "student", description: "Student" },
    ];
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string; description: string | null }>;
}
