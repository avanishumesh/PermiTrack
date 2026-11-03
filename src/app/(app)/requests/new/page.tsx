import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FolderPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { requireActiveViewer } from "@/lib/auth";
import { listMyProjectOptions } from "@/lib/services/projects";
import { listPermissionTypeOptions } from "@/lib/services/catalog";

export const metadata: Metadata = { title: "New request" };

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const viewer = await requireActiveViewer();
  const params = await searchParams;
  const [projects, permissionTypes] = await Promise.all([
    listMyProjectOptions(viewer.user.id, viewer.isAdmin),
    listPermissionTypeOptions(),
  ]);

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/requests">
            <ArrowLeft className="h-4 w-4" /> Requests
          </Link>
        </Button>
      </div>

      <PageHeader
        eyebrow="New request"
        title="Request a permission"
        description="Pick the project and the permission type. The form, required documents and approval chain are defined by the administrators."
      />

      {projects.length === 0 ? (
        <EmptyState
          title="Create a project first"
          description="Permission requests belong to a project so approvals can route to the right department and faculty guide."
          icon={<FolderPlus className="h-6 w-6" />}
          action={
            <Button asChild>
              <Link href="/projects/new">Create a project</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Request details</CardTitle>
            <CardDescription>
              A draft is created immediately. You can fill it in, upload documents and submit when
              ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewRequestForm
              projects={projects}
              permissionTypes={permissionTypes}
              defaultProjectId={
                params.projectId && projects.some((project) => project.id === params.projectId)
                  ? params.projectId
                  : undefined
              }
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
