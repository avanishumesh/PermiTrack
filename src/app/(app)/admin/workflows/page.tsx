import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Plus, Workflow } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { WorkflowPublishControls } from "@/components/admin/workflow-publish-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminViewer } from "@/lib/auth";
import { listWorkflowTemplates } from "@/lib/services/catalog";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Workflows" };

export default async function AdminWorkflowsPage() {
  await requireAdminViewer();
  const workflows = await listWorkflowTemplates();

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Approval workflows"
        description="Versioned approval chains. Requests pin the version active at draft creation, so publishing a new version never rewrites in-flight approvals."
        actions={
          <Button asChild>
            <Link href="/admin/workflows/new">
              <Plus className="h-4 w-4" /> New workflow
            </Link>
          </Button>
        }
      />

      {workflows.length === 0 ? (
        <EmptyState
          title="No workflows"
          description="Create a workflow for a permission type so submitted requests have an approval chain."
          icon={<Workflow className="h-6 w-6" />}
          action={
            <Button asChild>
              <Link href="/admin/workflows/new">Create workflow</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-2 sm:p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permission type</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Stages</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.map((workflow) => (
                  <TableRow key={workflow.id}>
                    <TableCell className="text-sm font-medium">
                      {workflow.permission_type_name}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/workflows/${workflow.id}`}
                        className="text-sm hover:underline"
                      >
                        {workflow.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">v{workflow.version}</TableCell>
                    <TableCell className="text-sm">{workflow.stage_count}</TableCell>
                    <TableCell className="text-sm">{workflow.request_count}</TableCell>
                    <TableCell>
                      {workflow.is_active ? (
                        <Badge variant="success">Published</Badge>
                      ) : workflow.request_count > 0 ? (
                        <Badge variant="muted">Retired</Badge>
                      ) : (
                        <Badge variant="warning">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(workflow.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <WorkflowPublishControls
                          templateId={workflow.id}
                          isActive={workflow.is_active}
                        />
                        <Link
                          href={`/admin/workflows/${workflow.id}`}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Open ${workflow.name}`}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
