import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getApiViewer } from "@/lib/auth";
import { canViewInternalNotes } from "@/lib/permissions";
import { getRequestDetail } from "@/lib/services/requests";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await getApiViewer();
    const { id } = await context.params;
    const detail = await getRequestDetail(id);

    if (!detail) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    const showInternal = canViewInternalNotes(viewer, detail.project, detail.stages);

    return NextResponse.json({
      request: {
        id: detail.request.id,
        status: detail.request.status,
        projectId: detail.request.project_id,
        permissionTypeId: detail.request.permission_type_id,
        workflowTemplateId: detail.request.workflow_template_id,
        currentStageId: detail.request.current_stage_id,
        formData: detail.request.form_data,
        submittedAt: detail.request.submitted_at,
        approvedAt: detail.request.approved_at,
        rejectedAt: detail.request.rejected_at,
        withdrawnAt: detail.request.withdrawn_at,
        createdAt: detail.request.created_at,
        updatedAt: detail.request.updated_at,
      },
      project: detail.project
        ? { id: detail.project.id, title: detail.project.title, department: detail.project.departments?.name ?? null }
        : null,
      permissionType: detail.permissionType
        ? {
            id: detail.permissionType.id,
            name: detail.permissionType.name,
            formSchema: detail.permissionType.form_schema,
          }
        : null,
      stages: detail.stages.map((stage) => ({
        id: stage.id,
        sequence: stage.sequence,
        name: stage.workflow_stages?.name ?? null,
        status: stage.status,
        assignedApproverId: stage.assigned_approver_id,
        dueAt: stage.due_at,
        completedAt: stage.completed_at,
      })),
      documents: detail.documents.map((document) => ({
        id: document.id,
        fileName: document.file_name,
        mimeType: document.mime_type,
        sizeBytes: document.size_bytes,
        version: document.version,
        verificationStatus: document.verification_status,
        requiredDocumentTypeId: document.required_document_type_id,
        replacedBy: document.replaced_by,
        createdAt: document.created_at,
        downloadUrl: `/api/documents/${document.id}/download`,
      })),
      queries: detail.queries.map((query) => ({
        id: query.id,
        question: query.question,
        response: query.response,
        status: query.status,
        isBlocking: query.is_blocking,
        createdAt: query.created_at,
        respondedAt: query.responded_at,
      })),
      actions: detail.actions
        .filter((action) => showInternal || !action.is_internal)
        .map((action) => ({
          id: action.id,
          action: action.action,
          actorId: action.actor_id,
          comment: action.comment,
          isInternal: action.is_internal,
          fromStatus: action.from_status,
          toStatus: action.to_status,
          createdAt: action.created_at,
        })),
    });
  } catch (error) {
    return apiError(error);
  }
}
