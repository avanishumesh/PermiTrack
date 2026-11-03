"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ZodError } from "zod";
import { requireActiveViewer } from "@/lib/auth";
import { AppError, actionError, type ActionState } from "@/lib/errors";
import { buildZodSchema, parseFormData } from "@/lib/forms/schema";
import { dispatchNotificationEmails } from "@/lib/email";
import { createRequest,
  performRequestAction,
  saveDraft,
  submitRequest,
  verifyDocument,
  withdrawRequest,
} from "@/lib/services/requests";
import { demoRequestContext, getDemoSession, isDemoId } from "@/lib/demo";
import { uploadRequestDocument } from "@/lib/services/documents";
import { createClient } from "@/lib/supabase/server";
import type { PermissionRequest, PermissionType, RequestStageState } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidFrom(value: FormDataEntryValue | null, label = "request"): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!UUID_RE.test(text)) {
    throw new AppError("PT422", `A valid ${label} is required.`, 422);
  }
  return text;
}

function optionalUuid(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text && UUID_RE.test(text) ? text : null;
}

function fieldErrorsFrom(error: ZodError) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] ? `f_${String(issue.path[0])}` : "form";
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

function queueEmails() {
  after(async () => {
    try {
      await dispatchNotificationEmails();
    } catch {
      // Email is best-effort and must never affect the request transaction.
    }
  });
}

function refreshRequestViews(requestId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  revalidatePath("/approvals");
  revalidatePath("/approvals/overdue");
  revalidatePath("/approvals/completed");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/analytics");
}

interface RequestContext {
  request: PermissionRequest;
  permissionType: PermissionType;
  stages: Array<RequestStageState & { workflow_stages?: { can_edit_fields: string[] } | null }>;
}

async function loadRequestContext(requestId: string): Promise<RequestContext> {
  if ((await getDemoSession().catch(() => null)) || isDemoId(requestId)) {
    const demo = demoRequestContext(requestId);
    if (!demo) throw new AppError("PT404", "Request not found or not accessible.", 404);
    return demo as unknown as RequestContext;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permission_requests")
    .select("*, permission_types(*)")
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw new AppError("PT404", "Request not found.", 404);
  if (!data) throw new AppError("PT404", "Request not found or not accessible.", 404);

  const { data: stages, error: stageError } = await supabase
    .from("request_stage_states")
    .select("*, workflow_stages(can_edit_fields)")
    .eq("request_id", requestId)
    .order("sequence", { ascending: true });

  if (stageError) throw new AppError("PT404", "Request not found.", 404);

  const record = data as unknown as PermissionRequest & { permission_types: PermissionType };

  return {
    request: record,
    permissionType: record.permission_types,
    stages: (stages ?? []) as unknown as RequestContext["stages"],
  };
}

function validateValues(schema: PermissionType["form_schema"], values: Record<string, unknown>) {
  return buildZodSchema(schema).safeParse(values);
}

// ---------------------------------------------------------------------------
// Create / draft / submit
// ---------------------------------------------------------------------------

export async function createRequestAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  let projectId: string;
  let permissionTypeId: string;
  try {
    projectId = uuidFrom(formData.get("projectId"), "project");
    permissionTypeId = uuidFrom(formData.get("permissionTypeId"), "permission type");
  } catch (error) {
    return actionError(error);
  }

  try {
    const id = await createRequest(projectId, permissionTypeId);
    revalidatePath("/requests");
    revalidatePath("/dashboard");
    return { ok: true, message: "Draft created.", redirectTo: `/requests/${id}` };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveDraftAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  let context: RequestContext;
  try {
    context = await loadRequestContext(uuidFrom(formData.get("requestId")));
  } catch (error) {
    return actionError(error);
  }

  if (!["DRAFT", "CHANGES_REQUESTED"].includes(context.request.status)) {
    return { ok: false, message: "This request can no longer be edited as a draft." };
  }

  const values = parseFormData(context.permissionType.form_schema, formData);
  const parsed = validateValues(context.permissionType.form_schema, values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const intent = String(formData.get("intent") ?? "save");

  try {
    await saveDraft(context.request.id, values);
    if (intent === "submit") {
      const result = await submitRequest(context.request.id);
      if (!result.ok) {
        return {
          ok: false,
          message: result.message ?? "The request was saved as a draft but could not be submitted.",
        };
      }
      refreshRequestViews(context.request.id);
      queueEmails();
      return { ok: true, message: "Request submitted and routed for review." };
    }
  } catch (error) {
    return actionError(error);
  }

  refreshRequestViews(context.request.id);
  return { ok: true, message: "Draft saved." };
}

export async function submitRequestAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  try {
    const requestId = uuidFrom(formData.get("requestId"));
    const result = await submitRequest(requestId);

    if (!result.ok) {
      return { ok: false, message: result.message ?? "The request could not be submitted." };
    }

    refreshRequestViews(requestId);
    queueEmails();
    return { ok: true, message: "Request submitted and routed for review." };
  } catch (error) {
    return actionError(error);
  }
}

export async function withdrawRequestAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  try {
    const requestId = uuidFrom(formData.get("requestId"));
    const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
    await withdrawRequest(requestId, reason || undefined);
    refreshRequestViews(requestId);
    queueEmails();
    return { ok: true, message: "Request withdrawn." };
  } catch (error) {
    return actionError(error);
  }
}

// ---------------------------------------------------------------------------
// Authority edit / resubmission
// ---------------------------------------------------------------------------

export async function authorityEditAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const viewer = await requireActiveViewer();

  let context: RequestContext;
  try {
    context = await loadRequestContext(uuidFrom(formData.get("requestId")));
  } catch (error) {
    return actionError(error);
  }

  const stageStateId = optionalUuid(formData.get("stageStateId"));
  const stage =
    context.stages.find((candidate) => candidate.id === stageStateId) ??
    context.stages.find((candidate) => candidate.id === context.request.current_stage_id) ??
    null;

  if (!stage) {
    return { ok: false, message: "The request has no active approval stage." };
  }

  const stagePermissions = stage.workflow_stages?.can_edit_fields ?? [];
  const allowedKeys = new Set(
    viewer.isAdmin
      ? context.permissionType.form_schema.fields.map((field) => field.key)
      : stagePermissions
  );

  const allValues = parseFormData(context.permissionType.form_schema, formData);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(allValues)) {
    if (allowedKeys.has(key)) patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, message: "You do not have permission to edit any fields on this stage." };
  }

  const merged = { ...context.request.form_data, ...patch };
  const parsed = validateValues(context.permissionType.form_schema, merged);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  const isInternal = formData.get("isInternal") === "on";

  try {
    const result = await performRequestAction({
      requestId: context.request.id,
      action: "EDIT_REQUEST_BY_AUTHORITY",
      stageStateId: stage.id,
      comment: reason || null,
      payload: {
        formData: patch,
        reason: reason || undefined,
        is_internal: isInternal,
      },
    });

    refreshRequestViews(context.request.id);
    queueEmails();

    if (result.reapprovalRequired) {
      return {
        ok: true,
        message:
          "Saved. Because a material field changed, earlier approvals were invalidated and the request re-entered review.",
      };
    }
    return { ok: true, message: "Saved. Earlier approvals remain valid." };
  } catch (error) {
    return actionError(error);
  }
}

export async function resubmitAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  let context: RequestContext;
  try {
    context = await loadRequestContext(uuidFrom(formData.get("requestId")));
  } catch (error) {
    return actionError(error);
  }

  if (context.request.status !== "CHANGES_REQUESTED") {
    return { ok: false, message: "This request is not waiting for changes." };
  }

  const values = parseFormData(context.permissionType.form_schema, formData);
  const merged = { ...context.request.form_data, ...values };
  const parsed = validateValues(context.permissionType.form_schema, merged);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  try {
    const result = await performRequestAction({
      requestId: context.request.id,
      action: "RESUBMIT_REQUEST",
      comment: String(formData.get("reason") ?? "").trim() || null,
      payload: {
        formData: values,
        reason: String(formData.get("reason") ?? "").trim() || undefined,
        queryId: optionalUuid(formData.get("queryId")) ?? undefined,
      },
    });

    if (result.ok === false) {
      return { ok: false, message: String(result.message ?? "The request could not be resubmitted.") };
    }

    refreshRequestViews(context.request.id);
    queueEmails();
    return { ok: true, message: "Changes submitted. The request is back with the approver." };
  } catch (error) {
    return actionError(error);
  }
}

// ---------------------------------------------------------------------------
// Generic approval action
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  APPROVE_STAGE: "Stage approved.",
  REJECT_REQUEST: "Request rejected.",
  REQUEST_CHANGES: "Changes requested from the student.",
  ASK_QUERY: "Question sent to the student.",
  ANSWER_QUERY: "Response sent.",
  FORWARD_STAGE: "Request forwarded.",
  DELEGATE_STAGE: "Stage delegated.",
};

export async function performAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  let requestId: string;
  try {
    requestId = uuidFrom(formData.get("requestId"));
  } catch (error) {
    return actionError(error);
  }

  const action = String(formData.get("action") ?? "");
  const allowed = [
    "APPROVE_STAGE",
    "REJECT_REQUEST",
    "REQUEST_CHANGES",
    "ASK_QUERY",
    "ANSWER_QUERY",
    "FORWARD_STAGE",
    "DELEGATE_STAGE",
  ];
  if (!allowed.includes(action)) {
    return { ok: false, message: "Unknown action." };
  }

  const stageStateId = optionalUuid(formData.get("stageStateId"));
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 4000);
  const isInternal = formData.get("isInternal") === "on";
  const resultPayload: Record<string, unknown> = {};

  if (["REJECT_REQUEST", "REQUEST_CHANGES", "ASK_QUERY", "FORWARD_STAGE"].includes(action)) {
    if (comment.length < 3) {
      return {
        ok: false,
        message:
          action === "ASK_QUERY"
            ? "Write the question you want to ask."
            : "A short explanation is required.",
        fieldErrors: { comment: ["Provide at least a few words."] },
      };
    }
  }

  if (action === "ANSWER_QUERY") {
    const queryId = optionalUuid(formData.get("queryId"));
    const response = String(formData.get("response") ?? "").trim().slice(0, 4000);
    if (!queryId) return { ok: false, message: "Choose the question you are answering." };
    if (response.length < 2) return { ok: false, message: "Write a response before sending." };
    resultPayload.queryId = queryId;
    resultPayload.response = response;
  }

  if (action === "ASK_QUERY") {
    resultPayload.is_blocking = formData.get("isBlocking") !== "off";
  }

  if (action === "FORWARD_STAGE") {
    const target = optionalUuid(formData.get("targetStageStateId"));
    if (!target) return { ok: false, message: "Choose the stage to forward to." };
    resultPayload.targetStageStateId = target;
    resultPayload.reason = comment;
  }

  if (action === "DELEGATE_STAGE") {
    const delegate = optionalUuid(formData.get("delegateToUserId"));
    if (!delegate) return { ok: false, message: "Choose who should take over this stage." };
    resultPayload.delegateToUserId = delegate;
    if (comment) resultPayload.reason = comment;
  }

  resultPayload.is_internal = isInternal;

  try {
    await performRequestAction({
      requestId,
      action,
      stageStateId,
      comment: comment || null,
      payload: resultPayload,
    });
  } catch (error) {
    return actionError(error);
  }

  refreshRequestViews(requestId);
  queueEmails();
  return { ok: true, message: ACTION_LABELS[action] ?? "Done." };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocumentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  let requestId: string;
  try {
    requestId = uuidFrom(formData.get("requestId"));
  } catch (error) {
    return actionError(error);
  }

  const documentTypeId = optionalUuid(formData.get("documentTypeId"));
  const replacesDocumentId = optionalUuid(formData.get("replacesDocumentId"));
  const file = formData.get("file");

  if (!(file && typeof file === "object" && "arrayBuffer" in file)) {
    return { ok: false, message: "Choose a file to upload." };
  }

  try {
    const result = await uploadRequestDocument({
      requestId,
      documentTypeId,
      file: file as File,
      replacesDocumentId,
    });
    refreshRequestViews(requestId);
    return { ok: true, message: `Document uploaded (version ${result.version}).` };
  } catch (error) {
    return actionError(error);
  }
}

export async function verifyDocumentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  try {
    const documentId = uuidFrom(formData.get("documentId"), "document");
    const status = String(formData.get("status") ?? "");
    if (!["PENDING", "VERIFIED", "REJECTED"].includes(status)) {
      return { ok: false, message: "Invalid verification status." };
    }
    const requestId = uuidFrom(formData.get("requestId"));
    await verifyDocument(documentId, status as "PENDING" | "VERIFIED" | "REJECTED");
    refreshRequestViews(requestId);
    return { ok: true, message: "Document verification updated." };
  } catch (error) {
    return actionError(error);
  }
}
