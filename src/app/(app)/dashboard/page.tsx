import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FilePlus2,
  FolderPlus,
  Inbox,
  Send,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { RequestsTable } from "@/components/requests-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { requireActiveViewer } from "@/lib/auth";
import { isDemoViewerId } from "@/lib/demo";
import { getAdminOverview, getAnalytics } from "@/lib/services/admin";
import {
  getWorkflowCounts,
  listApprovalInbox,
  listMyRequests,
} from "@/lib/services/requests";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

// Force dynamic: the dashboard is per-user and must never be statically cached.
export const dynamic = "force-dynamic";

/** Run a loader but fall back to `fallback` so one failing query never blanks the page. */
async function tolerant<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

export default async function DashboardPage() {
  const viewer = await requireActiveViewer();
  const isDemo = isDemoViewerId(viewer.user.id);

  // Three independent reads, each allowed to fail on its own. Non-staff users
  // skip the inbox query entirely instead of issuing a request that RLS will
  // reject or that returns nothing useful.
  const [mine, inbox, counts] = await Promise.all([
    tolerant(() => listMyRequests(viewer.user.id, 12), []),
    viewer.isStaff
      ? tolerant(() => listApprovalInbox(viewer.user.id), [])
      : Promise.resolve([]),
    tolerant(() => getWorkflowCounts(viewer.user.id), {
      inbox: 0,
      overdue: 0,
      completed: 0,
      unreadNotifications: 0,
    }),
  ]);

  // Admin snapshot is best-effort: the dashboard must load even if analytics
  // is slow or the caller lacks the admin role.
  const [overview, analytics] = viewer.isAdmin
    ? await Promise.all([
        tolerant(() => getAdminOverview(), null),
        tolerant(() => getAnalytics(), null),
      ])
    : [null, null];

  const open = mine.filter((row) =>
    ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"].includes(row.status)
  );
  const drafts = mine.filter((row) => row.status === "DRAFT");
  const approved = mine.filter((row) => row.status === "APPROVED");
  const firstName = viewer.profile.name.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      {isDemo ? (
        <Alert variant="info" title={viewer.isAdmin ? "Demo admin session" : "Demo student session"}>
          <p>
            You are exploring with live sample data shared between the demo student and demo admin.
            Submit, approve, ask questions and upload files — everything updates for both roles.
            Data resets when the dev server restarts.{" "}
            <Link href="/login" className="font-medium underline">
              Sign in with a real account
            </Link>{" "}
            to use the real database.
          </p>
        </Alert>
      ) : null}

      <PageHeader
        eyebrow="Dashboard"
        title={`${greeting}, ${firstName}`}
        description="Track your permissions, see what is waiting on you, and start a new request."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/projects/new">
                <FolderPlus className="h-4 w-4" /> New project
              </Link>
            </Button>
            <Button asChild>
              <Link href="/requests/new">
                <FilePlus2 className="h-4 w-4" /> New request
              </Link>
            </Button>
          </>
        }
      />

      {!viewer.profile.department_id ? (
        <Alert variant="info" title="Set up your department">
          <p>
            Your profile has no department yet. Ask an administrator to assign one so approvals
            resolve to the right people.
          </p>
        </Alert>
      ) : null}

      {counts.overdue > 0 ? (
        <Alert variant="danger" title={`${counts.overdue} approval${counts.overdue === 1 ? "" : "s"} overdue`}>
          <p>
            Overdue stages are visible to administrators and count against service targets.{" "}
            <Link href="/approvals/overdue" className="font-medium underline">
              Review overdue approvals
            </Link>
          </p>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open requests" value={open.length} hint="Submitted or under review" icon={Send} />
        <StatCard label="Drafts" value={drafts.length} hint="Not yet submitted" icon={FilePlus2} />
        <StatCard
          label="Awaiting your review"
          value={viewer.isStaff ? counts.inbox : 0}
          hint={viewer.isStaff ? (counts.overdue > 0 ? `${counts.overdue} overdue` : "On track") : "Staff only"}
          icon={Inbox}
          tone={counts.overdue > 0 ? "danger" : "default"}
        />
        <StatCard label="Approved" value={approved.length} hint="Issued permissions" icon={CheckCircle2} tone="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Your recent requests</CardTitle>
              <CardDescription>Every permission request you created.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/requests">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <RequestsTable rows={mine.slice(0, 6)} emptyMessage="Create your first permission request to get started." />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {viewer.isStaff ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Waiting on you</CardTitle>
                  <CardDescription>Stages assigned to you.</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/approvals">
                    Inbox <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {inbox.length === 0 ? (
                  <EmptyState
                    title="Nothing waiting"
                    description="When a request reaches your stage, it will appear here."
                    icon={<Clock3 className="h-5 w-5" />}
                    className="py-8"
                  />
                ) : (
                  inbox.slice(0, 5).map((row) => (
                    <Link
                      key={row.id}
                      href={`/requests/${row.id}`}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.permission_type_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.project_title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.current_stage_name ?? "Awaiting assignment"} · due {formatDate(row.due_at)}
                        </p>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>How approvals work</CardTitle>
                <CardDescription>Your request follows the workflow configured for its permission type.</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm">
                  {[
                    "Fill in the dynamic form for the permission type.",
                    "Upload every required document — versions are kept.",
                    "Submit and track each stage: guide, lab manager, head.",
                    "Answer queries or update details if changes are requested.",
                  ].map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        {index + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {viewer.isAdmin && analytics ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>University pulse</CardTitle>
                  <CardDescription>Live operational snapshot.</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/analytics">Analytics</Link>
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Pending approvals</p>
                  <p className="mt-1 text-xl font-semibold">{analytics.pendingApprovals}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Overdue</p>
                  <p className="mt-1 text-xl font-semibold text-rose-600">{analytics.overdueApprovals}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Stalled</p>
                  <p className="mt-1 text-xl font-semibold text-amber-600">{analytics.stalledRequests}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Users</p>
                  <p className="mt-1 text-xl font-semibold">{overview?.activeUsers ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {viewer.isAdmin && overview ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Administration shortcuts</CardTitle>
              <CardDescription>Configure the catalogue, workflows and people.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/admin/users", label: "Users & roles", hint: `${overview.totalUsers} accounts` },
              { href: "/admin/permission-types", label: "Permission types", hint: "Forms & documents" },
              { href: "/admin/workflows", label: "Workflows", hint: "Versioned stages" },
              { href: "/admin/analytics", label: "Analytics", hint: "Bottlenecks" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {analytics && analytics.stalledRequests > 0 ? (
        <Alert variant="warning" title={`${analytics.stalledRequests} request(s) stalled`}>
          <p>
            These requests are under review but have no active stage, usually because no approver
            could be resolved.{" "}
            <Link href="/admin/requests?filter=stalled" className="font-medium underline">
              Open the monitor
            </Link>{" "}
            to assign an approver.
          </p>
        </Alert>
      ) : null}

      {mine.length === 0 ? (
        <EmptyState
          title="Start with a project"
          description="Permission requests belong to a project. Create a project, invite your team, then request the permissions you need."
          icon={<AlertTriangle className="h-5 w-5" />}
          action={
            <Button asChild>
              <Link href="/projects/new">Create a project</Link>
            </Button>
          }
        />
      ) : null}
    </>
  );
}
