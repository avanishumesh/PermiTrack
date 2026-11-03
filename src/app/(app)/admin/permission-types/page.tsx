import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ClipboardList, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminViewer } from "@/lib/auth";
import { listPermissionTypes } from "@/lib/services/catalog";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Permission types" };

export default async function AdminPermissionTypesPage() {
  await requireAdminViewer();
  const permissionTypes = await listPermissionTypes({ includeInactive: true });

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Permission types"
        description="Each permission type defines a dynamic form, its required documents and the workflow that approves it."
        actions={
          <Button asChild>
            <Link href="/admin/permission-types/new">
              <Plus className="h-4 w-4" /> New permission type
            </Link>
          </Button>
        }
      />

      {permissionTypes.length === 0 ? (
        <EmptyState
          title="No permission types"
          description="Create the first permission type to define the form students fill in and the workflow that approves it."
          icon={<ClipboardList className="h-6 w-6" />}
          action={
            <Button asChild>
              <Link href="/admin/permission-types/new">Create permission type</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-2 sm:p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissionTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell>
                      <Link
                        href={`/admin/permission-types/${type.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {type.name}
                      </Link>
                      {type.description ? (
                        <p className="line-clamp-1 max-w-[280px] text-xs text-muted-foreground">
                          {type.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {type.department_name ?? "Any"}
                    </TableCell>
                    <TableCell className="text-sm">{type.field_count} fields</TableCell>
                    <TableCell className="text-sm">{type.document_count}</TableCell>
                    <TableCell className="text-sm">
                      {type.workflow_version ? (
                        <span className="inline-flex items-center gap-1.5">
                          v{type.workflow_version}
                          {type.workflow_active ? (
                            <Badge variant="success">Published</Badge>
                          ) : (
                            <Badge variant="muted">Draft</Badge>
                          )}
                        </span>
                      ) : (
                        <Badge variant="warning">Missing</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={type.is_active ? "success" : "muted"}>
                        {type.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(type.updated_at)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/permission-types/${type.id}`}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Edit ${type.name}`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
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
