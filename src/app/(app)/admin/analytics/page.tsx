import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, BarChart3, Clock3, FileText, Gauge, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminViewer } from "@/lib/auth";
import { getAnalytics } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

function hours(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value < 24) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} d`;
}

export default async function AdminAnalyticsPage() {
  await requireAdminViewer();
  const analytics = await getAnalytics();

  const maxWeekly = Math.max(1, ...analytics.weeklyVolume.map((week) => week.requests));
  const statusEntries = Object.entries(analytics.byStatus ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Analytics & bottlenecks"
        description="Where requests wait, which stages run long, and how volume is trending. Generated live from the workflow engine."
        actions={
          <span className="text-xs text-muted-foreground">
            Updated {formatDateTime(analytics.generatedAt)}
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total requests" value={analytics.totalRequests} icon={FileText} />
        <StatCard
          label="Pending approvals"
          value={analytics.pendingApprovals}
          icon={Clock3}
          tone={analytics.overdueApprovals > 0 ? "warning" : "default"}
          hint={`${analytics.overdueApprovals} overdue`}
        />
        <StatCard
          label="Overdue approvals"
          value={analytics.overdueApprovals}
          icon={AlarmClock}
          tone={analytics.overdueApprovals > 0 ? "danger" : "success"}
        />
        <StatCard
          label="Stalled requests"
          value={analytics.stalledRequests}
          icon={Gauge}
          tone={analytics.stalledRequests > 0 ? "warning" : "success"}
          hint={analytics.stalledRequests > 0 ? "Assign an approver" : "Healthy"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Weekly submission volume
            </CardTitle>
            <CardDescription>Requests submitted per week.</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.weeklyVolume.length === 0 ? (
              <EmptyState title="No submissions yet" className="py-8" />
            ) : (
              <div className="flex h-40 items-end gap-2">
                {analytics.weeklyVolume.map((week) => (
                  <div key={week.week} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t bg-primary/75"
                        style={{ height: `${Math.max(4, (week.requests / maxWeekly) * 100)}%` }}
                        title={`${week.requests} requests`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{week.week}</span>
                    <span className="text-[10px] font-medium">{week.requests}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status distribution</CardTitle>
            <CardDescription>Current state of all requests.</CardDescription>
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
                      <div className="h-2 rounded-full bg-primary/60" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Stage performance
          </CardTitle>
          <CardDescription>
            Average time to complete a stage, by permission type. Long bars are candidates for an SLA
            or staffing review.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {analytics.averageStageHours.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed stages yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Permission type</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.averageStageHours.map((row) => (
                  <TableRow key={`${row.permission_type}-${row.stage}`}>
                    <TableCell className="text-sm font-medium">{row.stage}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.permission_type}</TableCell>
                    <TableCell className="text-sm">{row.completed}</TableCell>
                    <TableCell className="text-right text-sm">{hours(Number(row.avg_hours))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bottlenecks</CardTitle>
          <CardDescription>Stages with the most active and overdue work right now.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {analytics.bottlenecks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bottlenecks detected.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Permission type</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Overdue</TableHead>
                  <TableHead className="text-right">Load</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.bottlenecks.map((row) => (
                  <TableRow key={`${row.permission_type}-${row.stage}`}>
                    <TableCell className="text-sm font-medium">{row.stage}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.permission_type}</TableCell>
                    <TableCell className="text-sm">{row.active}</TableCell>
                    <TableCell>
                      <Badge variant={row.overdue > 0 ? "danger" : "success"}>{row.overdue}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="ml-auto h-1.5 w-24 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-rose-500/70"
                          style={{
                            width: `${
                              row.active > 0
                                ? Math.min(100, Math.round((row.overdue / row.active) * 100))
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent decisions</CardTitle>
          <CardDescription>Latest workflow actions across all permission types.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {analytics.recentActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Permission type</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.recentActions.map((action) => (
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
