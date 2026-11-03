import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Inbox } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ApprovalTabs } from "@/components/approval-tabs";
import { RequestsTable } from "@/components/requests-table";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireActiveViewer } from "@/lib/auth";
import { getWorkflowCounts, listApprovalInbox } from "@/lib/services/requests";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const viewer = await requireActiveViewer();
  const [rows, counts] = await Promise.all([
    listApprovalInbox(viewer.user.id),
    getWorkflowCounts(viewer.user.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Approvals"
        title="Waiting on you"
        description="Requests where you are the assigned approver or active delegate. Act only on the stage shown — earlier stages must complete first."
        actions={
          counts.overdue > 0 ? (
            <Button asChild variant="outline">
              <Link href="/approvals/overdue">
                {counts.overdue} overdue
              </Link>
            </Button>
          ) : undefined
        }
      />

      <ApprovalTabs active="inbox" counts={counts} />

      <Card>
        <CardContent className="p-2 sm:p-4">
          {rows.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              description="When a request reaches your stage, it will appear here and you will receive a notification."
              icon={<Inbox className="h-6 w-6" />}
            />
          ) : (
            <RequestsTable rows={rows} showApprover />
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" /> Completed reviews are available under{" "}
        <Link href="/approvals/completed" className="font-medium text-primary hover:underline">
          Completed
        </Link>
        .
      </p>
    </>
  );
}
