import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderKanban,
  History,
  Info,
  ShieldAlert,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RequestStatusBadge } from "@/components/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApprovalChain } from "@/components/requests/approval-chain";
import { AuthorityActions } from "@/components/requests/authority-actions";
import { AuthorityEditForm } from "@/components/requests/authority-edit-form";
import { AssignStageForm } from "@/components/requests/assign-stage-form";
import { DocumentPanel } from "@/components/requests/document-panel";
import { QueryPanel } from "@/components/requests/query-panel";
import { RequestForm } from "@/components/requests/request-form";
import { RequestTimeline } from "@/components/requests/request-timeline";
import { RevisionList } from "@/components/requests/revision-list";
import { SchemaFields } from "@/components/requests/schema-fields";
import { WithdrawForm } from "@/components/requests/withdraw-form";
import { requireActiveViewer } from "@/lib/auth";
import { defaultFormValues } from "@/lib/forms/schema";
import {
  canActOnStage,
  canEditDraft,
  canUploadDocuments,
  canViewInternalNotes,
  canWithdraw,
  editableFieldKeys,
  getCurrentStage,
  isStudentEditor,
} from "@/lib/permissions";
import { getRequestDetail } from "@/lib/services/requests";
import { getDocumentSignedUrls } from "@/lib/services/documents";
import { searchPeople } from "@/lib/services/projects";
import type { FormSchema } from "@/lib/types";
import { formatDate, formatDateTime, isOverdue } from "@/lib/utils";

export const metadata: Metadata = { title: "Request" };

const EMPTY_SCHEMA: FormSchema = { fields: [] };

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireActiveViewer();
  const detail = await getRequestDetail(id);
  if (!detail) notFound();

  const { request, project, permissionType, stages, actions, documents, requiredDocumentTypes, queries, revisions, members, actors } =
    detail;

  const schema = permissionType?.form_schema ?? EMPTY_SCHEMA;
  const values = defaultFormValues(schema, request.form_data);
  const currentStage = getCurrentStage(request, stages);

  const studentEditor = isStudentEditor(viewer, request, members);
  const draftEditable = canEditDraft(viewer, request, members);
  const resubmittable = request.status === "CHANGES_REQUESTED" && studentEditor;
  const uploadsAllowed = canUploadDocuments(viewer, request, members);
  const canAct = canActOnStage(viewer, request, currentStage);
  const showInternal = canViewInternalNotes(viewer, project, stages);
  const withdrawable = canWithdraw(viewer, request);

  const rawEditable = editableFieldKeys(viewer, request, currentStage);
  const editableKeys = rawEditable.includes("*")
    ? schema.fields.map((field) => field.key)
    : rawEditable;
  const materialKeys = schema.fields.filter((field) => field.material).map((field) => field.key);

  const stalled = request.status === "UNDER_REVIEW" && !currentStage;
  const openBlockingQuery = queries.some((query) => query.status === "OPEN" && query.is_blocking);
  const canAnswer = studentEditor && queries.some((query) => query.status === "OPEN");

  // The stage an administrator can (re)assign: the earliest pending/invalidated
  // stage whose predecessors have all completed.
  const recoveryStage =
    viewer.isAdmin && !currentStage
      ? stages.find(
          (stage) =>
            ["PENDING", "INVALIDATED"].includes(stage.status) &&
            stages
              .filter((candidate) => candidate.sequence < stage.sequence)
              .every((candidate) => ["APPROVED", "SKIPPED"].includes(candidate.status))
        ) ?? null
      : null;

  const laterStages = stages.filter(
    (stage) =>
      currentStage &&
      stage.sequence > currentStage.sequence &&
      ["PENDING", "ACTIVE"].includes(stage.status)
  );

  let signedUrls: Record<string, string> = {};
  try {
    signedUrls = await getDocumentSignedUrls(documents.map((document) => document.storage_path));
  } catch {
    signedUrls = {};
  }

  const needsDirectory = canAct || (viewer.isAdmin && stalled);
  const directory = needsDirectory
    ? await searchPeople().catch(() => [])
    : [];

  const overdue = currentStage
    ? isOverdue(currentStage.due_at, currentStage.status === "ACTIVE")
    : false;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={viewer.isStaff ? "/approvals" : "/requests"}>
            <ArrowLeft className="h-4 w-4" /> {viewer.isStaff ? "Approvals" : "Requests"}
          </Link>
        </Button>
        {withdrawable ? <WithdrawForm requestId={request.id} /> : null}
      </div>

      <PageHeader
        eyebrow={permissionType?.name ?? "Permission request"}
        title={permissionType?.name ?? "Permission request"}
        description={permissionType?.description ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={request.status} />
            {overdue ? <Badge variant="danger">Overdue</Badge> : null}
            {stalled ? <Badge variant="warning">Stalled</Badge> : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <FolderKanban className="h-3.5 w-3.5" />
          <Link href={`/projects/${request.project_id}`} className="hover:underline">
            {project?.title ?? "Project"}
          </Link>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Requested by{" "}
          {actors[request.created_by]?.name ?? "a team member"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" /> Created {formatDate(request.created_at)}
        </span>
      </div>

      {request.status === "CHANGES_REQUESTED" ? (
        <Alert variant="warning" title="Changes requested">
          <p>
            An approver asked for changes. Update the form or documents below and resubmit to return
            the request to the approval chain.
          </p>
        </Alert>
      ) : null}

      {request.status === "REJECTED" ? (
        <Alert variant="danger" title="This request was rejected">
          <p>
            The rejection reason is in the activity history. A rejected request cannot be reopened —
            create a new request if circumstances change.
          </p>
        </Alert>
      ) : null}

      {request.status === "APPROVED" ? (
        <Alert variant="success" title="Permission granted">
          <p>
            Final approval was recorded {formatDate(request.approved_at)}. Every stage in the pinned
            workflow version completed successfully.
          </p>
        </Alert>
      ) : null}

      {stalled ? (
        <Alert variant="warning" title="No active approval stage">
          <p>
            The request is under review but has no active stage — usually because the configured
            approver is missing or inactive.
            {viewer.isAdmin ? " Assign an approver below to resume the workflow." : " An administrator has been notified."}
          </p>
        </Alert>
      ) : null}

      {openBlockingQuery && studentEditor ? (
        <Alert variant="info" title="An approver is waiting on your answer">
          <p>Answer the open question below; the stage stays paused until you respond.</p>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{draftEditable || resubmittable ? "Permission details" : "Requested details"}</CardTitle>
              <CardDescription>
                {draftEditable || resubmittable
                  ? "Fields are defined by the administrators for this permission type. Required fields are validated again on the server when you submit."
                  : "The values the approvers are reviewing. Changes are recorded with before/after values."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {draftEditable ? (
                <RequestForm
                  mode="draft"
                  requestId={request.id}
                  schema={schema}
                  initialValues={request.form_data}
                />
              ) : resubmittable ? (
                <RequestForm
                  mode="resubmit"
                  requestId={request.id}
                  schema={schema}
                  initialValues={request.form_data}
                />
              ) : (
                <SchemaFields schema={schema} values={values} readOnly />
              )}
            </CardContent>
          </Card>

          {canAct && editableKeys.length > 0 && currentStage ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" /> Edit as authority
                </CardTitle>
                <CardDescription>
                  You may edit only the fields this stage permits. Material changes invalidate
                  earlier approvals and restart the chain at the affected stage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AuthorityEditForm
                  requestId={request.id}
                  stageStateId={currentStage.id}
                  schema={schema}
                  initialValues={request.form_data}
                  editableKeys={editableKeys}
                  materialKeys={materialKeys}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Documents
              </CardTitle>
              <CardDescription>
                Documents are private. Links are signed for five minutes and every version is kept.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentPanel
                requestId={request.id}
                requiredDocumentTypes={requiredDocumentTypes}
                documents={documents}
                signedUrls={signedUrls}
                canUpload={uploadsAllowed}
                canVerify={canAct || viewer.isAdmin}
                locked={!uploadsAllowed}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" /> Approval chain
              </CardTitle>
              <CardDescription>
                Pinned workflow version — stages keep the configuration they were submitted with.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApprovalChain stages={stages} actors={actors} currentStageId={request.current_stage_id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Questions &amp; clarifications</CardTitle>
              <CardDescription>
                Questions do not decide the request. Blocking questions pause the current stage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QueryPanel
                requestId={request.id}
                queries={queries}
                actors={actors}
                canAnswer={canAnswer}
                stageStateId={currentStage?.id ?? null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4" /> History
              </CardTitle>
              <CardDescription>
                The immutable record of every action.{" "}
                {showInternal ? "Internal notes are visible to you." : "Internal staff notes are hidden."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="activity">
                <TabsList>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="revisions">Field changes</TabsTrigger>
                </TabsList>
                <TabsContent value="activity">
                  <RequestTimeline actions={actions} actors={actors} showInternal={showInternal} />
                </TabsContent>
                <TabsContent value="revisions">
                  <RevisionList revisions={revisions} schema={schema} actors={actors} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <RequestStatusBadge status={request.status} />
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Current stage</span>
                <span className="text-right font-medium">
                  {currentStage?.workflow_stages?.name ?? (stalled ? "None — needs assignment" : "—")}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Approver</span>
                <span className="text-right">
                  {currentStage?.assigned_approver_id
                    ? actors[currentStage.assigned_approver_id]?.name ?? "Assigned"
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Due</span>
                <span className={overdue ? "font-medium text-rose-600" : ""}>
                  {currentStage?.due_at ? formatDate(currentStage.due_at) : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-3 border-t pt-2.5">
                <span className="text-muted-foreground">Submitted</span>
                <span>{formatDateTime(request.submitted_at)}</span>
              </div>
              {request.approved_at ? (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Approved</span>
                  <span className="text-emerald-700">{formatDateTime(request.approved_at)}</span>
                </div>
              ) : null}
              {request.rejected_at ? (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Rejected</span>
                  <span className="text-rose-700">{formatDateTime(request.rejected_at)}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {canAct && currentStage ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your decision</CardTitle>
                <CardDescription>
                  Stage {currentStage.sequence}: {currentStage.workflow_stages?.name ?? "Review"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AuthorityActions
                  requestId={request.id}
                  stageStateId={currentStage.id}
                  stageName={currentStage.workflow_stages?.name ?? "this stage"}
                  isFinalStage={laterStages.length === 0}
                  forwardTargets={laterStages.map((stage) => ({
                    id: stage.id,
                    name: stage.workflow_stages?.name ?? `Stage ${stage.sequence}`,
                    sequence: stage.sequence,
                  }))}
                  delegates={directory.map((person) => ({
                    id: person.id,
                    name: person.name,
                    email: person.email,
                  }))}
                />
              </CardContent>
            </Card>
          ) : null}

          {viewer.isAdmin && stalled && recoveryStage ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Resume workflow
                </CardTitle>
                <CardDescription>
                  Assign an approver to the stalled stage. The original configuration is preserved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AssignStageForm
                  requestId={request.id}
                  stageStateId={recoveryStage.id}
                  stageName={recoveryStage.workflow_stages?.name ?? `Stage ${recoveryStage.sequence}`}
                  candidates={directory.map((person) => ({
                    id: person.id,
                    name: person.name,
                    email: person.email,
                  }))}
                />
              </CardContent>
            </Card>
          ) : null}

          {request.status === "APPROVED" ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Permission issued
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>All stages completed under the pinned workflow version.</p>
                <p className="text-xs">
                  Reference: <span className="font-mono">{request.id.slice(0, 8)}</span>
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
