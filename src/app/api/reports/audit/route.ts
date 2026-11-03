import { apiError, csvResponse } from "@/lib/api";
import { getApiAdmin } from "@/lib/auth";
import { listAuditLogs } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await getApiAdmin();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? undefined;
    const entityType = url.searchParams.get("entityType") ?? undefined;

    const logs = await listAuditLogs({ action, entityType, limit: 2000 });

    const csvRows = logs.map((log) => ({
      id: log.id,
      created_at: log.created_at,
      actor_id: log.actor_id ?? "system",
      action: log.action,
      entity_type: log.entity_type,
      entity_id: log.entity_id ?? "",
      metadata: log.metadata ?? "",
      ip_address: log.ip_address ?? "",
      user_agent: log.user_agent ?? "",
    }));

    return csvResponse(
      `permitrack-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      csvRows,
      [
        "id",
        "created_at",
        "actor_id",
        "action",
        "entity_type",
        "entity_id",
        "metadata",
        "ip_address",
        "user_agent",
      ]
    );
  } catch (error) {
    return apiError(error);
  }
}
