import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Workflow } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PermissionTypeEditor } from "@/components/admin/permission-type-editor";
import { DocumentRequirements } from "@/components/admin/document-requirements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminViewer } from "@/lib/auth";
import { listDepartments } from "@/lib/services/admin";
import { getPermissionTypeDetail } from "@/lib/services/catalog";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit permission type" };

export default async function PermissionTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminViewer();
  const detail = await getPermissionTypeDetail(id);
  if (!detail) notFound();

  const departments = await listDepartments();
  const { permissionType, documents, workflows } = detail;

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/permission-types">
            <ArrowLeft className="h-4 w-4" /> Permission types
          </Link>
        </Button>
      </div>

      <PageHeader
        eyebrow="Administration"
        title={permissionType.name}
        description={
          permissionType.description ??
          "Define the form, the required documents and the workflow for this permission."
        }
        actions={
          <Badge variant={permissionType.is_active ? "success" : "muted"}>
            {permissionType.is_active ? "Active" : "Inactive"}
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Form definition</CardTitle>
          <CardDescription>
            Changing a field affects new requests only. Existing requests keep the values they were
            submitted with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionTypeEditor permissionType={permissionType} departments={departments} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Required documents</CardTitle>
          <CardDescription>
            Students must provide one current file per required document. Replacements create a new
            version and keep the audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentRequirements permissionTypeId={permissionType.id} documents={documents} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-4 w-4" /> Workflow versions
            </CardTitle>
            <CardDescription>
              Requests pin the version that is active when their draft is created. Publishing a new
              version never changes in-flight requests.
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/workflows/new?permissionTypeId=${permissionType.id}`}>
              New version
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {workflows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No workflow yet. Students cannot submit this permission until a version is published.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {workflows.map((workflow: any) => (
                <li key={workflow.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {workflow.name}{" "}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        v{workflow.version}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(workflow.workflow_stages ?? []).length} stages · created{" "}
                      {formatDate(workflow.created_at)}
                    </p>
                  </div>
                  <Badge variant={workflow.is_active ? "success" : "muted"}>
                    {workflow.is_active ? "Published" : "Draft / inactive"}
                  </Badge>
                  <Link
                    href={`/admin/workflows/${workflow.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Open builder <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
