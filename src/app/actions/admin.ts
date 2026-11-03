"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdminViewer } from "@/lib/auth";
import { actionError, type ActionState } from "@/lib/errors";
import { dispatchNotificationEmails } from "@/lib/email";
import {
  createUser,
  createWorkflowTemplate,
  deactivateWorkflowTemplate,
  deleteDocumentType,
  publishWorkflowTemplate,
  saveDocumentType,
  savePermissionType,
  setUserRoles,
  updateUser,
  updateWorkflowDraft,
  upsertDepartment,
} from "@/lib/services/admin";
import { assignStage } from "@/lib/services/requests";
import {
  departmentInputSchema,
  documentTypeInputSchema,
  permissionTypeInputSchema,
  roleAssignmentSchema,
  userCreateSchema,
  userUpdateSchema,
  workflowInputSchema,
} from "@/lib/validation/schemas";

function parseJson(value: FormDataEntryValue | null, fallback: unknown) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function bool(value: FormDataEntryValue | null, fallback = false) {
  if (value === null) return fallback;
  return value === "on" || value === "true" || value === "1";
}

function fieldErrorsFrom(error: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

function revalidateAdmin(extra: string[] = []) {
  for (const path of ["/admin", "/admin/users", "/admin/departments", "/admin/permission-types", "/admin/workflows", "/admin/requests", "/admin/analytics", "/admin/audit", ...extra]) {
    revalidatePath(path);
  }
}

const uuid = z.string().uuid();

// ---------------------------------------------------------------------------
// Users and departments
// ---------------------------------------------------------------------------

export async function createUserAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();

  const parsed = userCreateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password") || undefined,
    departmentId: formData.get("departmentId") ?? "",
    roles: parseJson(formData.get("roles"), []),
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const result = await createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      departmentId: parsed.data.departmentId ?? null,
      password: parsed.data.password,
      roles: parsed.data.roles,
    });

    revalidateAdmin();
    return {
      ok: true,
      message: result.temporaryPassword
        ? `User created. Temporary password: ${result.temporaryPassword} — share it securely; they should change it after signing in.`
        : "User created.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();

  const parsed = userUpdateSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    departmentId: formData.get("departmentId") ?? "",
    isActive: bool(formData.get("isActive"), true),
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    await updateUser({
      userId: parsed.data.userId,
      name: parsed.data.name,
      departmentId: parsed.data.departmentId ?? null,
      isActive: parsed.data.isActive,
    });
    revalidateAdmin();
    return { ok: true, message: "User updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function setUserRolesAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();

  const userId = uuid.safeParse(formData.get("userId"));
  const roles = roleAssignmentSchema.safeParse(parseJson(formData.get("roles"), []));

  if (!userId.success || !roles.success) {
    return { ok: false, message: "Check the role assignments." };
  }

  try {
    await setUserRoles(userId.data, roles.data);
    revalidateAdmin();
    return { ok: true, message: "Roles updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveDepartmentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();

  const parsed = departmentInputSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name"),
    parentId: formData.get("parentId") ?? "",
    headUserId: formData.get("headUserId") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    await upsertDepartment({
      id: parsed.data.id ?? null,
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      headUserId: parsed.data.headUserId ?? null,
    });
    revalidateAdmin();
    return { ok: true, message: "Department saved." };
  } catch (error) {
    return actionError(error);
  }
}

// ---------------------------------------------------------------------------
// Permission types and documents
// ---------------------------------------------------------------------------

export async function savePermissionTypeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();

  const parsed = permissionTypeInputSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    departmentId: formData.get("departmentId") ?? "",
    isActive: bool(formData.get("isActive"), true),
    formSchema: parseJson(formData.get("formSchema"), { fields: [] }),
    eligibilityRules: parseJson(formData.get("eligibilityRules"), null),
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the form definition.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const id = await savePermissionType({
      id: parsed.data.id ?? null,
      name: parsed.data.name,
      description: parsed.data.description,
      departmentId: parsed.data.departmentId ?? null,
      isActive: parsed.data.isActive,
      formSchema: parsed.data.formSchema,
      eligibilityRules: parsed.data.eligibilityRules ?? null,
    });
    revalidateAdmin();
    return {
      ok: true,
      message: "Permission type saved.",
      redirectTo: `/admin/permission-types/${id}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveDocumentTypeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();

  const parsed = documentTypeInputSchema.safeParse({
    id: formData.get("id") ?? "",
    permissionTypeId: formData.get("permissionTypeId"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    isRequired: bool(formData.get("isRequired"), true),
    acceptedMimeTypes: parseJson(formData.get("acceptedMimeTypes"), [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    maxSizeMb: formData.get("maxSizeMb") ?? 10,
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the document settings.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    await saveDocumentType({
      id: parsed.data.id ?? null,
      permissionTypeId: parsed.data.permissionTypeId,
      name: parsed.data.name,
      description: parsed.data.description,
      isRequired: parsed.data.isRequired,
      acceptedMimeTypes: parsed.data.acceptedMimeTypes,
      maxSizeMb: parsed.data.maxSizeMb,
    });
    revalidateAdmin();
    return { ok: true, message: "Document requirement saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteDocumentTypeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();

  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "Invalid document." };

  try {
    await deleteDocumentType(id.data);
    revalidateAdmin();
    return { ok: true, message: "Document requirement removed." };
  } catch (error) {
    return actionError(error);
  }
}

// ---------------------------------------------------------------------------
// Workflow configuration
// ---------------------------------------------------------------------------

export async function saveWorkflowAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();

  const parsed = workflowInputSchema.safeParse(
    parseJson(formData.get("workflow"), null)
  );

  if (!parsed.success) {
    return {
      ok: false,
      message: "The workflow definition is invalid.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  try {
    if (parsed.data.id) {
      await updateWorkflowDraft(parsed.data);
      revalidateAdmin(["/admin/workflows"]);
      return { ok: true, message: "Draft workflow updated." };
    }

    const id = await createWorkflowTemplate(parsed.data);
    revalidateAdmin();
    return {
      ok: true,
      message: "Workflow draft created.",
      redirectTo: `/admin/workflows/${id}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function publishWorkflowAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();
  const id = uuid.safeParse(formData.get("templateId"));
  if (!id.success) return { ok: false, message: "Invalid workflow." };

  try {
    await publishWorkflowTemplate(id.data);
    revalidateAdmin();
    return { ok: true, message: "Workflow version published. Previous versions remain on in-flight requests." };
  } catch (error) {
    return actionError(error);
  }
}

export async function deactivateWorkflowAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();
  const id = uuid.safeParse(formData.get("templateId"));
  if (!id.success) return { ok: false, message: "Invalid workflow." };

  try {
    await deactivateWorkflowTemplate(id.data);
    revalidateAdmin();
    return { ok: true, message: "Workflow deactivated. No new requests will be pinned to it." };
  } catch (error) {
    return actionError(error);
  }
}

export async function assignStageAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminViewer();

  const requestId = uuid.safeParse(formData.get("requestId"));
  const stageStateId = uuid.safeParse(formData.get("stageStateId"));
  const approverId = uuid.safeParse(formData.get("approverId"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);

  if (!requestId.success || !stageStateId.success || !approverId.success) {
    return { ok: false, message: "Select a stage and an approver." };
  }

  try {
    await assignStage(requestId.data, stageStateId.data, approverId.data, reason || undefined);
    revalidatePath(`/requests/${requestId.data}`);
    revalidateAdmin();
    after(async () => {
      try {
        await dispatchNotificationEmails();
      } catch {
        // best effort
      }
    });
    return { ok: true, message: "Approver assigned and notified." };
  } catch (error) {
    return actionError(error);
  }
}
