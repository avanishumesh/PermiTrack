import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RequestsTable } from "@/components/requests-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireActiveViewer } from "@/lib/auth";
import { listPortfolioRequests } from "@/lib/services/requests";
import { REQUEST_STATUS_LABELS } from "@/lib/constants";
import type { RequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My requests" };

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "UNDER_REVIEW", label: "In review" },
  { value: "CHANGES_REQUESTED", label: "Changes requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const viewer = await requireActiveViewer();
  const params = await searchParams;
  const status = FILTERS.some((filter) => filter.value === params.status) ? params.status : "";

  const requests = await listPortfolioRequests(viewer.user.id, { status: status || undefined });

  const counts = requests.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        eyebrow="Permissions"
        title="My requests"
        description="Every permission request you created or that belongs to one of your projects. Filter by status to find what needs attention."
        actions={
          <Button asChild>
            <Link href="/requests/new">
              <FilePlus2 className="h-4 w-4" /> New request
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => {
          const active = status === filter.value;
          const href = filter.value ? `/requests?status=${filter.value}` : "/requests";
          const count = filter.value ? counts[filter.value] : undefined;
          return (
            <Link
              key={filter.value || "all"}
              href={href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {filter.label}
              {count ? (
                <span
                  className={cn(
                    "rounded-full px-1 text-[10px]",
                    active ? "bg-primary-foreground/20" : "bg-muted-foreground/15"
                  )}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={status ? `No ${REQUEST_STATUS_LABELS[status as RequestStatus].toLowerCase()} requests` : "No requests yet"}
                description="Permission requests live inside a project. Create a project, add your team, then request the access you need."
                icon={<FileText className="h-6 w-6" />}
                action={
                  <Button asChild>
                    <Link href="/requests/new">Start a request</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="p-2 sm:p-4">
              <RequestsTable rows={requests} />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
