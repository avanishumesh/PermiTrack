import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { RequestStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RequestSummary } from "@/lib/services/requests";
import { formatDate, isOverdue, relativeTime } from "@/lib/utils";

export function RequestsTable({
  rows,
  showApprover = false,
  emptyMessage = "No requests yet.",
}: {
  rows: RequestSummary[];
  showApprover?: boolean;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Permission</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Stage</TableHead>
          {showApprover ? <TableHead>Approver</TableHead> : null}
          <TableHead>Updated</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const overdue = isOverdue(row.due_at, row.status === "UNDER_REVIEW");
          return (
            <TableRow key={row.id}>
              <TableCell>
                <Link href={`/requests/${row.id}`} className="font-medium hover:underline">
                  {row.permission_type_name}
                </Link>
                <p className="text-xs text-muted-foreground">{formatDate(row.submitted_at ?? row.created_at)}</p>
              </TableCell>
              <TableCell className="max-w-[220px]">
                <span className="line-clamp-1">{row.project_title}</span>
              </TableCell>
              <TableCell>
                <RequestStatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                {row.current_stage_name ? (
                  <div className="space-y-1">
                    <span className="text-sm">{row.current_stage_name}</span>
                    <p className="text-xs text-muted-foreground">
                      Stage {row.current_sequence} of {row.stage_count}
                    </p>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
                {overdue ? (
                  <Badge variant="danger" className="mt-1">
                    Overdue
                  </Badge>
                ) : null}
              </TableCell>
              {showApprover ? (
                <TableCell className="text-sm text-muted-foreground">
                  {row.assigned_approver_name ?? "—"}
                </TableCell>
              ) : null}
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {relativeTime(row.updated_at)}
              </TableCell>
              <TableCell>
                <Link
                  href={`/requests/${row.id}`}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Open ${row.permission_type_name}`}
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
