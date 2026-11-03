import { apiError, csvResponse } from "@/lib/api";
import { getApiAdmin } from "@/lib/auth";
import { listAllRequests } from "@/lib/services/requests";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await getApiAdmin();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const stalledOnly = url.searchParams.get("filter") === "stalled";
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();

    const rows = await listAllRequests({ status: status || undefined, limit: 1000 });
    const filtered = rows.filter((row) => {
      if (stalledOnly && !(row.status === "UNDER_REVIEW" && !row.current_stage_name)) return false;
      if (!query) return true;
      return (
        row.permission_type_name.toLowerCase().includes(query) ||
        row.project_title.toLowerCase().includes(query) ||
        (row.assigned_approver_name ?? "").toLowerCase().includes(query)
      );
    });

    const csvRows = filtered.map((row) => ({
      id: row.id,
      status: row.status,
      permission_type: row.permission_type_name,
      project: row.project_title,
      current_stage: row.current_stage_name ?? "",
      current_sequence: row.current_sequence ?? "",
      stage_count: row.stage_count,
      assigned_approver: row.assigned_approver_name ?? "",
      due_at: row.due_at ?? "",
      submitted_at: row.submitted_at ?? "",
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return csvResponse(
      `permitrack-requests-${new Date().toISOString().slice(0, 10)}.csv`,
      csvRows,
      [
        "id",
        "status",
        "permission_type",
        "project",
        "current_stage",
        "current_sequence",
        "stage_count",
        "assigned_approver",
        "due_at",
        "submitted_at",
        "created_at",
        "updated_at",
      ]
    );
  } catch (error) {
    return apiError(error);
  }
}
