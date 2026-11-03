import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { WorkflowEditor } from "@/components/admin/workflow-editor";
import { WorkflowPublishControls } from "@/components/admin/workflow-publish-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminViewer } from "@/lib/auth";
import {
  getPermissionTypeDetail,
  listRoles,
  listWorkflowTemplates,
} from "@/lib/services/catalog";
import { searchPeople } from "@/lib/services/projects";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Workflow" };

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminViewer();

  const workflows = await listWorkflowTemplates();
  const workflow = workflows.find((candidate) => candidate.id === id);
  if (!workflow) notFound();

  const [detail, roles, people] = await Promise.all([
    getPermissionTypeDetail(workflow.permission_type_id),
    listRoles(),
    searchPeople().catch(() => []),
  ]);

  const fieldOptions = (detail?.permissionType.form_schema.fields ?? []).map((field) => ({
    key: field.key,
    label: field.label,
    material: field.material,
  }));

  // Published versions and versions referenced by requests are immutable.
  const readOnly = workflow.is_active || workflow.request_count > 0;

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/admin/permission-types/${workflow.permission_type_id}`}>
            <ArrowLeft className="h-4 w-4" /> {workflow.permission_type_name}
          </Link>
        </Button>
      </div>

      <PageHeader
        eyebrow={`Version ${workflow.version}`}
        title={workflow.name}
        description={`${workflow.stage_count} stage${workflow.stage_count === 1 ? "" : "s"} · created ${formatDate(
          workflow.created_at
        )} · ${workflow.request_count} request${workflow.request_count === 1 ? "" : "s"} pinned to this version`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={workflow.is_active ? "success" : "muted"}>
              {workflow.is_active ? "Published" : "Not published"}
            </Badge>
            <WorkflowPublishControls templateId={workflow.id} isActive={workflow.is_active} />
          </div>
        }
      />

      {readOnly ? (
        <Card className="border-dashed">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Need to change the chain?</CardTitle>
              <CardDescription>
                This version is {workflow.is_active ? "published" : "referenced by requests"} and is
                immutable. Create a new version — existing requests keep this configuration.
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/admin/workflows/new?permissionTypeId=${workflow.permission_type_id}`}
              >
                <Copy className="h-4 w-4" /> New version
              </Link>
            </Button>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Stages</CardTitle>
          <CardDescription>
            Conditions determine whether a stage runs. Empty invalidation lists mean any material
            change requires re-approval at this stage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowEditor
            permissionTypeId={workflow.permission_type_id}
            fieldOptions={fieldOptions}
            roles={roles}
            people={people}
            readOnly={readOnly}
            workflow={{
              id: workflow.id,
              name: workflow.name,
              stages: workflow.stages.map((stage) => ({
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
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {workflows
              .filter((candidate) => candidate.permission_type_id === workflow.permission_type_id)
              .sort((a, b) => b.version - a.version)
              .map((candidate) => (
                <li key={candidate.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="text-sm font-medium">v{candidate.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {candidate.stage_count} stages · {candidate.request_count} requests
                  </span>
                  {candidate.is_active ? <Badge variant="success">Active</Badge> : null}
                  {candidate.id === workflow.id ? (
                    <span className="text-xs text-muted-foreground">(viewing)</span>
                  ) : (
                    <Link
                      href={`/admin/workflows/${candidate.id}`}
                      className="ml-auto text-xs font-medium text-primary hover:underline"
                    >
                      Open
                    </Link>
                  )}
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
