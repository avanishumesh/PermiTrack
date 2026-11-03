import { CheckCircle2, HelpCircle } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { QueryAnswer } from "@/components/requests/query-answer";
import { Badge } from "@/components/ui/badge";
import type { QueryRow } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function QueryPanel({
  requestId,
  queries,
  actors,
  canAnswer,
  stageStateId,
}: {
  requestId: string;
  queries: QueryRow[];
  actors: Record<string, { name: string; email: string }>;
  canAnswer: boolean;
  stageStateId?: string | null;
}) {
  if (queries.length === 0) {
    return (
      <EmptyState
        title="No questions"
        description="Approvers can ask for clarification without pausing or deciding the request."
        className="py-8"
      />
    );
  }

  return (
    <ul className="space-y-3">
      {queries.map((query) => {
        const open = query.status === "OPEN";
        return (
          <li key={query.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="flex items-start gap-1.5 text-sm font-medium">
                <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {query.question}
              </p>
              <div className="flex items-center gap-1.5">
                {query.is_blocking ? <Badge variant="warning">Blocking</Badge> : null}
                <Badge variant={open ? "warning" : "success"}>
                  {open ? "Open" : "Answered"}
                </Badge>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Asked by {actors[query.asked_by]?.name ?? "an approver"} ·{" "}
              {formatDateTime(query.created_at)}
            </p>

            {query.response ? (
              <div className="mt-2 rounded-md border bg-muted/40 px-2.5 py-2">
                <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  {actors[query.responded_by ?? ""]?.name ?? "Student"} answered
                  {query.responded_at ? ` · ${formatDateTime(query.responded_at)}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{query.response}</p>
              </div>
            ) : null}

            {open && canAnswer ? (
              <QueryAnswer requestId={requestId} queryId={query.id} stageStateId={stageStateId} />
            ) : null}
            {open && !canAnswer ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Waiting for the student to answer.
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
