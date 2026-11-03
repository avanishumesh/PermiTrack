import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  ClipboardList,
  FileText,
  Settings2,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminViewer } from "@/lib/auth";
import { getAdminOverview, getAnalytics } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Administration" };

const SHORTCUTS = [
  { href: "/admin/users", label: "Users & roles", hint: "Accounts, roles, department scope", icon: Users },
  { href: "/admin/departments", label: "Departments", hint: "Hierarchy and heads", icon: Building2 },
  { href: "/admin/permission-types", label: "Permission types", hint: "Forms and required documents", icon: ClipboardList },
  { href: "/admin/workflows", label: "Workflows", hint: "Versioned approval chains", icon: Workflow },
  { href: "/admin/requests", label: "Monitor requests", hint: "Every request and stalled stages", icon: Settings2 },
  { href: "/admin/analytics", label: "Analytics", hint: "Volume and bottlenecks", icon: BarChart3 },
  { href: "/admin/audit", label: "Audit log", hint: "Every privileged action", icon: Activity },
];

export default async function AdminOverviewPage() {
  await requireAdminViewer();
  const [overview, analytics] = await Promise.all([getAdminOverview(), getAnalytics()]);

  const statusEntries = Object.entries(analytics.byStatus ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="University control room"
        description="Configure the catalogue, approval chains and people. Monitor how requests move and where they get stuck."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/analytics">
              <BarChart3 className="h-4 w-4" /> Analytics
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Accounts" value={overview.totalUsers} hint={`${overview.activeUsers} active`} icon={Users} />
        <StatCard label="Requests" value={analytics.totalRequests} hint="All time" icon={FileText} />
        <StatCard
          label="Pending approvals"
          value={analytics.pendingApprovals}
          hint={`${analytics.overdueApprovals} overdue`}
          icon={ShieldCheck}
          tone={analytics.overdueApprovals > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Stalled requests"
          value={analytics.stalledRequests}
          hint={analytics.stalledRequests > 0 ? "Needs an approver" : "None"}
          icon={Settings2}
          tone={analytics.stalledRequests > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Status breakdown</CardTitle>
            <CardDescription>Where every request currently sits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {statusEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            ) : (
              statusEntries.map(([status, count]) => {
                const width = analytics.totalRequests
                  ? Math.max(4, Math.round((count / analytics.totalRequests) * 100))
                  : 0;
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{status.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary/70"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Jump straight to the settings you need.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {SHORTCUTS.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="group flex items-start gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <shortcut.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{shortcut.label}</span>
                  <span className="block text-xs text-muted-foreground">{shortcut.hint}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent approval activity</CardTitle>
            <CardDescription>The latest decisions across the university.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/audit">
              Audit log <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {analytics.recentActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.recentActions.slice(0, 10).map((action) => (
                  <TableRow key={action.id}>
                    <TableCell>
                      <Badge variant="outline">{action.action.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{action.permission_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{action.actor_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(action.created_at)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/requests/${action.request_id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
