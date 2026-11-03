import { Lock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ACTION_LABELS } from "@/lib/constants";
import type { ApprovalAction } from "@/lib/types";
import { formatDateTime, initials } from "@/lib/utils";

export function RequestTimeline({
  actions,
  actors,
  showInternal,
}: {
  actions: ApprovalAction[];
  actors: Record<string, { name: string; email: string }>;
  showInternal: boolean;
}) {
  const visible = actions.filter((action) => showInternal || !action.is_internal);

  if (visible.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Actions appear here as the request moves through its approval chain."
        className="py-8"
      />
    );
  }

  return (
    <ol className="space-y-3">
      {visible.map((action) => {
        const actor = actors[action.actor_id];
        return (
          <li key={action.id} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
              {initials(actor?.name, actor?.email)}
            </span>
            <div className="min-w-0 flex-1 border-b pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">
                  {ACTION_LABELS[action.action] ?? action.action}
                </span>
                <span className="text-xs text-muted-foreground">
                  {actor?.name ?? "Unknown user"}
                </span>
                {action.is_internal ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    <Lock className="h-2.5 w-2.5" /> Internal
                  </span>
                ) : null}
              </div>
              {action.comment ? (
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {action.comment}
                </p>
              ) : null}
              {action.from_status && action.to_status && action.from_status !== action.to_status ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {action.from_status} → {action.to_status}
                </p>
              ) : null}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatDateTime(action.created_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
