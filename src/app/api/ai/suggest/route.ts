import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getApiViewer } from "@/lib/auth";
import { suggestPermissionDetails } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { aiSuggestSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Advisory only: returns writing suggestions for a student. It never creates,
 * approves or rejects anything.
 */
export async function POST(request: Request) {
  try {
    await getApiViewer();
    const body = await request.json().catch(() => null);
    const parsed = aiSuggestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 422 }
      );
    }

    const supabase = await createClient();
    const { data: project, error } = await supabase
      .from("projects")
      .select("id, title, category")
      .eq("id", parsed.data.projectId)
      .maybeSingle();

    if (error) throw error;
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const advice = await suggestPermissionDetails({
      permissionName: (project as { title?: string }).title,
      description: parsed.data.description,
    });

    return NextResponse.json({ ...advice, generatedAt: new Date().toISOString() });
  } catch (error) {
    return apiError(error);
  }
}
