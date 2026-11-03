import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getApiViewer } from "@/lib/auth";
import { reviewDocumentChecklist } from "@/lib/ai";
import { getRequestDetail } from "@/lib/services/requests";
import { aiDocumentCheckSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Advisory document checklist review. It only reports what is missing or
 * unverified; verification remains an explicit human action.
 */
export async function POST(request: Request) {
  try {
    await getApiViewer();
    const body = await request.json().catch(() => null);
    const parsed = aiDocumentCheckSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 422 });
    }

    const detail = await getRequestDetail(parsed.data.requestId);
    if (!detail) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    const currentDocuments = detail.documents.filter((document) => !document.replaced_by);
    const checklist = detail.requiredDocumentTypes.map((type) => {
      const uploaded = currentDocuments.find(
        (document) => document.required_document_type_id === type.id
      );
      return {
        name: type.name,
        required: type.is_required,
        uploaded: Boolean(uploaded),
        verificationStatus: uploaded?.verification_status ?? null,
        version: uploaded?.version ?? null,
      };
    });

    const advice = await reviewDocumentChecklist({
      permissionType: detail.permissionType?.name ?? "Permission",
      requestStatus: detail.request.status,
      checklist,
    });

    return NextResponse.json({
      ...advice,
      checklist,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
