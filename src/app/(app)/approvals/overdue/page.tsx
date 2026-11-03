import type { Metadata } from "next";
import { AlarmClock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ApprovalTabs } from "@/components/approval-tabs";
import { RequestsTable } from "@/components/requests-table";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { requireActiveViewer } from "@/lib/auth";
import { getWorkflowCounts, listOverdueApprovals } from "@/lib/services/requests";

export const metadata: Metadata = { title: "Overdue approvals" };

export default async function OverdueApprovalsPage() {
  const viewer = await requireActiveViewer();
  const [rows, counts] = await Promise.all([
    listOverdueApprovals(viewer.user.id),
    getWorkflowCounts(viewer.user.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Approvals"
        title="Overdue reviews"
        description="Stages assigned to you whose service target has passed. Overdue stages are visible to administrators and appear in bottleneck analytics."
      />

      <ApprovalTabs active="overdue" counts={counts} />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing overdue"
          description="Every stage assigned to you is within its service target."
          icon={<AlarmClock className="h-6 w-6" />}
        />
      ) : (
        <>
          <Alert variant="danger" title={`${rows.length} overdue review${rows.length === 1 ? "" : "s"}`}>
            <p>Clear these first — students are waiting on a decision.</p>
          </Alert>
          <Card>
            <CardContent className="p-2 sm:p-4">
              <RequestsTable rows={rows} showApprover />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
