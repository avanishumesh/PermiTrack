import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Download, MonitorCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RequestsTable } from "@/components/requests-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAdminViewer } from "@/lib/auth";
import { listAllRequests } from "@/lib/services/requests";
import { REQUEST_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { RequestStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Monitor requests" };

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "CHANGES_REQUESTED", label: "Changes" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; filter?: string }>;
}) {
  await requireAdminViewer();
  const params = await searchParams;
  const status = STATUS_FILTERS.some((filter) => filter.value === params.status)
    ? params.status
    : "";
  const stalledOnly = params.filter === "stalled";
  const query = (params.q ?? "").trim().toLowerCase();

  const rows = await listAllRequests({ status: status || undefined, limit: 300 });

  const filtered = rows.filter((row) => {
    if (stalledOnly && !(row.status === "UNDER_REVIEW" && !row.current_stage_name)) return false;
    if (!query) return true;
    return (
      row.permission_type_name.toLowerCase().includes(query) ||
      row.project_title.toLowerCase().includes(query) ||
      (row.assigned_approver_name ?? "").toLowerCase().includes(query)
    );
  });

  const stalledCount = rows.filter(
    (row) => row.status === "UNDER_REVIEW" && !row.current_stage_name
  ).length;

  const queryString = new URLSearchParams();
  if (status) queryString.set("status", status);
  if (stalledOnly) queryString.set("filter", "stalled");
  if (query) queryString.set("q", params.q!.trim());

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Monitor requests"
        description="Every request across the university, including stalled stages that need an administrator to assign an approver."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/reports/requests${queryString.toString() ? `?${queryString}` : ""}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
        }
      />

      {stalledCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <span>
            {stalledCount} request{stalledCount === 1 ? "" : "s"} under review without an active
            stage.
          </span>
          <Link
            href="/admin/requests?filter=stalled"
            className="font-medium underline underline-offset-2"
          >
            Show stalled
          </Link>
        </div>
      ) : null}

      <form action="/admin/requests" className="flex flex-wrap items-center gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {stalledOnly ? <input type="hidden" name="filter" value="stalled" /> : null}
        <Input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search permission type, project or approver"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {query || status || stalledOnly ? (
          <Button asChild variant="ghost">
            <Link href="/admin/requests">Clear</Link>
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((filter) => {
          const active = status === filter.value;
          const search = new URLSearchParams();
          if (filter.value) search.set("status", filter.value);
          if (stalledOnly) search.set("filter", "stalled");
          if (query) search.set("q", params.q!.trim());
          return (
            <Link
              key={filter.value || "all"}
              href={`/admin/requests${search.toString() ? `?${search}` : ""}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {filter.label}
            </Link>
          );
        })}
        <Link
          href="/admin/requests?filter=stalled"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            stalledOnly
              ? "border-amber-500 bg-amber-500 text-white"
              : "bg-card text-amber-700 hover:bg-amber-50"
          )}
        >
          <AlertTriangle className="h-3 w-3" /> Stalled
        </Link>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          {filtered.length === 0 ? (
            <EmptyState
              title={stalledOnly ? "No stalled requests" : "No requests match"}
              description={
                stalledOnly
                  ? "Every request under review has an active approver."
                  : "Adjust the filters or search for a different permission type."
              }
              icon={<MonitorCheck className="h-6 w-6" />}
            />
          ) : (
            <RequestsTable rows={filtered} showApprover />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} loaded requests
        {status ? ` · status ${REQUEST_STATUS_LABELS[status as RequestStatus]}` : ""}. The CSV export
        includes the same filters.
      </p>

      {stalledOnly ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="warning">Tip</Badge> Open a stalled request and use “Resume workflow” to
          assign an active approver.
        </p>
      ) : null}
    </>
  );
}
