import type { Metadata } from "next";
import Link from "next/link";
import { Download, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminViewer } from "@/lib/auth";
import { listAuditLogs } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entityType?: string }>;
}) {
  await requireAdminViewer();
  const params = await searchParams;
  const action = (params.action ?? "").trim();
  const entityType = (params.entityType ?? "").trim();

  const logs = await listAuditLogs({
    action: action || undefined,
    entityType: entityType || undefined,
    limit: 300,
  });

  const exportQuery = new URLSearchParams();
  if (action) exportQuery.set("action", action);
  if (entityType) exportQuery.set("entityType", entityType);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Immutable record of privileged actions: approvals, edits, delegations, workflow changes, role changes and document verification."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/reports/audit${exportQuery.toString() ? `?${exportQuery}` : ""}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
        }
      />

      <form action="/admin/audit" className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="audit-action" className="text-xs font-medium text-muted-foreground">
            Action
          </label>
          <Input
            id="audit-action"
            name="action"
            defaultValue={action}
            placeholder="e.g. APPROVE_STAGE"
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="audit-entity" className="text-xs font-medium text-muted-foreground">
            Entity type
          </label>
          <Input
            id="audit-entity"
            name="entityType"
            defaultValue={entityType}
            placeholder="e.g. permission_request"
            className="w-56"
          />
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {action || entityType ? (
          <Button asChild variant="ghost">
            <Link href="/admin/audit">Clear</Link>
          </Button>
        ) : null}
      </form>

      <Card>
        <CardContent className="overflow-x-auto p-2 sm:p-4">
          {logs.length === 0 ? (
            <EmptyState
              title="No audit entries"
              description="Actions appear here as administrators, approvers and students use the system."
              icon={<ScrollText className="h-6 w-6" />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.action.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{log.entity_type}</span>
                      {log.entity_id ? (
                        <span className="block font-mono text-muted-foreground">
                          {log.entity_id.slice(0, 8)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {log.actor_id ? log.actor_id.slice(0, 8) : "system"}
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      {log.metadata ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            View metadata
                          </summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
