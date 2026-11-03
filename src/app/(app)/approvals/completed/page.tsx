import type { Metadata } from "next";
import { History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ApprovalTabs } from "@/components/approval-tabs";
import { RequestsTable } from "@/components/requests-table";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireActiveViewer } from "@/lib/auth";
import { getWorkflowCounts, listCompletedReviews } from "@/lib/services/requests";

export const metadata: Metadata = { title: "Completed reviews" };

export default async function CompletedApprovalsPage() {
  const viewer = await requireActiveViewer();
  const [rows, counts] = await Promise.all([
    listCompletedReviews(viewer.user.id),
    getWorkflowCounts(viewer.user.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Approvals"
        title="Completed reviews"
        description="Requests you approved, rejected or sent back for changes, most recent first."
      />

      <ApprovalTabs active="completed" counts={counts} />

      <Card>
        <CardContent className="p-2 sm:p-4">
          {rows.length === 0 ? (
            <EmptyState
              title="No completed reviews yet"
              description="Your decisions appear here once you act on a stage."
              icon={<History className="h-6 w-6" />}
            />
          ) : (
            <RequestsTable rows={rows} showApprover />
          )}
        </CardContent>
      </Card>
    </>
  );
}
