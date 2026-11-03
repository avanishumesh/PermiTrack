import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getApiViewer } from "@/lib/auth";
import { getDocumentSignedUrl } from "@/lib/services/documents";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await getApiViewer();
    const { id } = await context.params;

    // Row-level security only returns documents whose request the viewer can see.
    const supabase = await createClient();
    const { data: document, error } = await supabase
      .from("request_documents")
      .select("id, storage_path, file_name")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const signedUrl = await getDocumentSignedUrl(document.storage_path as string);
    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": "no-store",
        "X-Document-Name": encodeURIComponent(String(document.file_name ?? "document")),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
