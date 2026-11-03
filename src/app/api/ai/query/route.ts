import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getApiViewer } from "@/lib/auth";
import { assistQueryResponse } from "@/lib/ai";
import { getRequestDetail } from "@/lib/services/requests";
import { aiQuerySchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** Advisory drafting help for answering an approver's question. */
export async function POST(request: Request) {
  try {
    await getApiViewer();
    const body = await request.json().catch(() => null);
    const parsed = aiQuerySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 422 });
    }

    const detail = await getRequestDetail(parsed.data.requestId);
    if (!detail) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    const query = detail.queries.find((candidate) => candidate.id === parsed.data.queryId);
    if (!query) {
      return NextResponse.json({ error: "Question not found." }, { status: 404 });
    }

    const advice = await assistQueryResponse(query.question, {
      permissionType: detail.permissionType?.name ?? "Permission",
      requestStatus: detail.request.status,
      formData: detail.request.form_data,
      documents: detail.documents
        .filter((document) => !document.replaced_by)
        .map((document) => document.file_name),
      previousResponse: query.response,
    });

    return NextResponse.json({ ...advice, generatedAt: new Date().toISOString() });
  } catch (error) {
    return apiError(error);
  }
}
