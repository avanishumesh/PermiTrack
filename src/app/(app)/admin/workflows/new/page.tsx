import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Workflow } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { WorkflowEditor } from "@/components/admin/workflow-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminViewer } from "@/lib/auth";
import { listPermissionTypes, listWorkflowTemplates, listRoles } from "@/lib/services/catalog";
import { getPermissionTypeDetail } from "@/lib/services/catalog";
import { searchPeople } from "@/lib/services/projects";

export const metadata: Metadata = { title: "New workflow" };

export default async function NewWorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ permissionTypeId?: string }>;
}) {
  await requireAdminViewer();
  const params = await searchParams;
  const permissionTypes = await listPermissionTypes({ includeInactive: true });

  if (!params.permissionTypeId) {
    return (
      <>
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/admin/workflows">
              <ArrowLeft className="h-4 w-4" /> Workflows
            </Link>
          </Button>
        </div>
        <PageHeader
          eyebrow="Administration"
          title="Choose a permission type"
          description="A workflow belongs to exactly one permission type and defines its approval chain."
        />
        {permissionTypes.length === 0 ? (
          <EmptyState
            title="No permission types yet"
            description="Create a permission type first, then build its workflow."
            icon={<Workflow className="h-6 w-6" />}
            action={
              <Button asChild>
                <Link href="/admin/permission-types/new">Create permission type</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-2">
              <ul className="divide-y">
                {permissionTypes.map((type) => (
                  <li key={type.id}>
                    <Link
                      href={`/admin/workflows/new?permissionTypeId=${type.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div>
                        <p className="text-sm font-medium">{type.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {type.field_count} fields · {type.document_count} documents ·{" "}
                          {type.workflow_version ? `latest v${type.workflow_version}` : "no workflow"}
                        </p>
                      </div>
                      <Workflow className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  const detail = await getPermissionTypeDetail(params.permissionTypeId);
  if (!detail) {
    return (
      <EmptyState
        title="Permission type not found"
        description="The permission type may have been removed."
        action={
          <Button asChild>
            <Link href="/admin/workflows/new">Choose another</Link>
          </Button>
        }
      />
    );
  }

  const [workflows, roles, people] = await Promise.all([
    listWorkflowTemplates(),
    listRoles(),
    searchPeople().catch(() => []),
  ]);

  const latest = workflows
    .filter((workflow) => workflow.permission_type_id === detail.permissionType.id)
    .sort((a, b) => b.version - a.version)[0];

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/admin/permission-types/${detail.permissionType.id}`}>
            <ArrowLeft className="h-4 w-4" /> {detail.permissionType.name}
          </Link>
        </Button>
      </div>

      <PageHeader
        eyebrow="New workflow"
        title={detail.permissionType.name}
        description={
          latest
            ? `Create a new draft version based on v${latest.version}. Publishing it replaces v${latest.version} for new drafts only.`
            : "Define the ordered approval stages for this permission type."
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Approval chain</CardTitle>
          <CardDescription>
            Save as a draft first, then publish. A permission type needs a published workflow before
            students can submit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowEditor
            permissionTypeId={detail.permissionType.id}
            fieldOptions={detail.permissionType.form_schema.fields.map((field) => ({
              key: field.key,
              label: field.label,
              material: field.material,
            }))}
            roles={roles}
            people={people}
            workflow={
              latest
                ? {
                    name: latest.name,
                    stages: latest.stages.map((stage) => ({
                      name: stage.name,
                      approverType: stage.approver_type,
                      approverRoleId: stage.approver_role_id,
                      approverUserId: stage.approver_user_id,
                      departmentScope: stage.department_scope,
                      canEditFields: stage.can_edit_fields,
                      invalidatesOn: stage.invalidates_on,
                      slaHours: stage.sla_hours,
                      conditions: stage.conditions,
                    })),
                  }
                : null
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
