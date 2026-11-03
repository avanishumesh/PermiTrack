import type {
  PermissionRequest,
  RequestStageState,
  Viewer,
  WorkflowStage,
} from "@/lib/types";

type StageWithDefinition = RequestStageState & {
  workflow_stages?: (Pick<WorkflowStage, "name" | "can_edit_fields" | "invalidates_on"> & {
    id?: string;
  }) | null;
};

const OPEN_STATUSES: PermissionRequest["status"][] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
];

export function getCurrentStage<T extends StageWithDefinition>(
  request: PermissionRequest,
  stages: T[]
): T | null {
  return (
    stages.find((stage) => stage.id === request.current_stage_id) ??
    stages.find((stage) => stage.status === "ACTIVE") ??
    null
  );
}

/** A stage can only be acted on by its assigned approver (or an admin). */
export function canActOnStage(
  viewer: Viewer,
  request: PermissionRequest,
  stage: StageWithDefinition | null
): boolean {
  if (!stage) return false;
  if (!OPEN_STATUSES.includes(request.status)) return false;
  if (stage.status !== "ACTIVE") return false;
  return viewer.isAdmin || stage.assigned_approver_id === viewer.user.id;
}

export function canResubmit(
  viewer: Viewer,
  request: PermissionRequest,
  members: Array<{ user_id: string; role: string }>
): boolean {
  if (request.status !== "CHANGES_REQUESTED") return false;
  return isStudentEditor(viewer, request, members);
}

export function isStudentEditor(
  viewer: Viewer,
  request: PermissionRequest,
  members: Array<{ user_id: string; role: string }>
): boolean {
  if (request.created_by === viewer.user.id) return true;
  return members.some(
    (member) =>
      member.user_id === viewer.user.id && ["OWNER", "EDITOR"].includes(member.role)
  );
}

export function canEditDraft(
  viewer: Viewer,
  request: PermissionRequest,
  members: Array<{ user_id: string; role: string }>
): boolean {
  return (
    ["DRAFT", "CHANGES_REQUESTED"].includes(request.status) &&
    isStudentEditor(viewer, request, members)
  );
}

export function canUploadDocuments(
  viewer: Viewer,
  request: PermissionRequest,
  members: Array<{ user_id: string; role: string }>
): boolean {
  return (
    ["DRAFT", "CHANGES_REQUESTED", "UNDER_REVIEW"].includes(request.status) &&
    isStudentEditor(viewer, request, members)
  );
}

export function canWithdraw(
  viewer: Viewer,
  request: PermissionRequest
): boolean {
  return (
    !["APPROVED", "REJECTED", "WITHDRAWN"].includes(request.status) &&
    (request.created_by === viewer.user.id || viewer.isAdmin)
  );
}

/**
 * Fields the current authority may edit. Mirrors the SQL engine: admins may
 * edit anything, other actors only `can_edit_fields` on the active stage.
 */
export function editableFieldKeys(
  viewer: Viewer,
  request: PermissionRequest,
  stage: StageWithDefinition | null
): string[] {
  if (!canActOnStage(viewer, request, stage)) return [];
  if (viewer.isAdmin) return ["*"];
  return stage?.workflow_stages?.can_edit_fields ?? [];
}

export function canEditField(
  viewer: Viewer,
  request: PermissionRequest,
  stage: StageWithDefinition | null,
  fieldKey: string
): boolean {
  const keys = editableFieldKeys(viewer, request, stage);
  return keys.includes("*") || keys.includes(fieldKey);
}

/**
 * Internal notes are staff-only. Students never see them, even for requests
 * they created.
 */
export function canViewInternalNotes(
  viewer: Viewer,
  project: { faculty_guide_id: string | null } | null,
  stages: StageWithDefinition[]
): boolean {
  if (viewer.isAdmin) return true;
  if (project?.faculty_guide_id === viewer.user.id) return true;
  return stages.some(
    (stage) =>
      stage.assigned_approver_id === viewer.user.id ||
      stage.delegated_from_user_id === viewer.user.id
  );
}

export function canManageProject(
  viewer: Viewer,
  project: { created_by: string; faculty_guide_id: string | null }
): boolean {
  return (
    viewer.isAdmin ||
    project.created_by === viewer.user.id ||
    project.faculty_guide_id === viewer.user.id
  );
}

export function canVerifyDocuments(
  viewer: Viewer,
  request: PermissionRequest,
  stage: StageWithDefinition | null
): boolean {
  return viewer.isAdmin || canActOnStage(viewer, request, stage);
}

export function canAssignStage(viewer: Viewer): boolean {
  return viewer.isAdmin;
}

export function viewerRoleLabel(viewer: Viewer): string {
  if (viewer.isAdmin) return "Administrator";
  if (viewer.roles.length === 0) return "Student";
  return viewer.roles
    .map((role) => role.replace(/_/g, " "))
    .map((role) => role.charAt(0).toUpperCase() + role.slice(1))
    .join(" · ");
}
