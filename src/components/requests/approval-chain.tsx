import { Check, Clock3, MinusCircle, RotateCcw, X } from "lucide-react";
import { StageStatusBadge } from "@/components/status-badge";
import type { RequestStageState } from "@/lib/types";
import { formatDate, isOverdue, cn } from "@/lib/utils";

type StageRow = RequestStageState & {
  workflow_stages?: { name: string; can_edit_fields?: string[] } | null;
};

function StageIcon({ status }: { status: RequestStageState["status"] }) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full";
  switch (status) {
    case "APPROVED":
      return (
        <span className={cn(base, "bg-emerald-100 text-emerald-700")}>
          <Check className="h-4 w-4" />
        </span>
      );
    case "REJECTED":
      return (
        <span className={cn(base, "bg-rose-100 text-rose-700")}>
          <X className="h-4 w-4" />
        </span>
      );
    case "INVALIDATED":
      return (
        <span className={cn(base, "bg-violet-100 text-violet-700")}>
          <RotateCcw className="h-4 w-4" />
        </span>
      );
    case "SKIPPED":
      return (
        <span className={cn(base, "bg-slate-100 text-slate-500")}>
          <MinusCircle className="h-4 w-4" />
        </span>
      );
    case "ACTIVE":
    case "WAITING_STUDENT":
      return (
        <span className={cn(base, "bg-amber-100 text-amber-700")}>
          <Clock3 className="h-4 w-4" />
        </span>
      );
    default:
      return (
        <span className={cn(base, "bg-muted text-xs font-semibold text-muted-foreground")}>
          {""}
        </span>
      );
  }
}

export function ApprovalChain({
  stages,
  actors,
  currentStageId,
}: {
  stages: StageRow[];
  actors: Record<string, { name: string; email: string }>;
  currentStageId: string | null;
}) {
  if (stages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No approval stages exist yet. Stages are created when the request is submitted against its
        pinned workflow version.
      </p>
    );
  }

  return (
    <ol className="space-y-1">
      {stages.map((stage, index) => {
        const isCurrent = stage.id === currentStageId || stage.status === "ACTIVE";
        const approver = stage.assigned_approver_id
          ? actors[stage.assigned_approver_id]?.name ?? "Assigned approver"
          : null;
        const overdue =
          isCurrent && stage.status !== "APPROVED" && isOverdue(stage.due_at, stage.status === "ACTIVE");

        return (
          <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < stages.length - 1 ? (
              <span className="absolute left-3.5 top-8 h-[calc(100%-1.5rem)] w-px bg-border" />
            ) : null}
            <StageIcon status={stage.status} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">
                  {String(stage.sequence).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium">
                  {stage.workflow_stages?.name ?? `Stage ${stage.sequence}`}
                </span>
                <StageStatusBadge status={stage.status} />
                {overdue ? (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                    Overdue
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {approver ? `Approver: ${approver}` : "Approver not yet resolved"}
                {stage.due_at && stage.status !== "APPROVED" ? ` · due ${formatDate(stage.due_at)}` : ""}
                {stage.completed_at ? ` · completed ${formatDate(stage.completed_at)}` : ""}
              </p>
              {stage.delegated_from_user_id ? (
                <p className="text-xs text-muted-foreground">
                  Delegated from {actors[stage.delegated_from_user_id]?.name ?? "another approver"}
                </p>
              ) : null}
              {stage.decision_comment ? (
                <p className="rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                  {stage.decision_comment}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
