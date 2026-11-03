import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { Brand } from "@/components/brand";
import { AppNav, type NavSection } from "@/components/app-nav";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { getWorkflowCounts } from "@/lib/services/requests";
import { unreadNotificationCount } from "@/lib/services/notifications";
import { viewerRoleLabel } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profile.is_active) redirect("/pending");

  const [counts, unread] = await Promise.all([
    getWorkflowCounts(viewer.user.id).catch(() => ({
      inbox: 0,
      overdue: 0,
      completed: 0,
      unreadNotifications: 0,
    })),
    unreadNotificationCount().catch(() => 0),
  ]);

  const sections: NavSection[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/projects", label: "Projects", icon: "projects" },
        { href: "/requests", label: "My requests", icon: "requests" },
        ...(viewer.isStaff || counts.inbox > 0
          ? [
              {
                href: "/approvals",
                label: "Approvals",
                icon: "approvals" as const,
                badge: counts.inbox,
              },
            ]
          : []),
        {
          href: "/notifications",
          label: "Notifications",
          icon: "notifications",
          badge: unread,
        },
      ],
    },
  ];

  if (viewer.isAdmin) {
    sections.push({
      label: "Administration",
      items: [
        { href: "/admin", label: "Overview", icon: "overview", exact: true },
        { href: "/admin/users", label: "Users & roles", icon: "users" },
        { href: "/admin/departments", label: "Departments", icon: "departments" },
        { href: "/admin/permission-types", label: "Permission types", icon: "catalogue" },
        { href: "/admin/workflows", label: "Workflows", icon: "workflows" },
        { href: "/admin/requests", label: "Monitor requests", icon: "monitor" },
        { href: "/admin/analytics", label: "Analytics", icon: "analytics" },
        { href: "/admin/audit", label: "Audit log", icon: "audit" },
      ],
    });
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-14 items-center border-b px-5">
          <Brand href="/dashboard" />
        </div>
        <AppNav sections={sections} />
        <div className="border-t px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">{viewer.profile.name}</p>
          <p>{viewerRoleLabel(viewer)}</p>
          <p className="mt-1">{viewer.departmentName ?? "No department"}</p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/85 px-3 backdrop-blur lg:px-8">
          <div className="lg:hidden">
            <Brand href="/dashboard" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Link href="/notifications">
                <Bell className="h-4 w-4" />
                {unread > 0 ? (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
            </Button>
            <UserMenu
              name={viewer.profile.name}
              email={viewer.profile.email}
              roleLabel={viewerRoleLabel(viewer)}
              isAdmin={viewer.isAdmin}
            />
          </div>
        </header>

        <AppNav sections={sections} variant="mobile" />

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>

        <footer className="no-print border-t px-4 py-4 text-center text-[11px] text-muted-foreground lg:px-8">
          PermiTrack · Every approval is server-enforced and audit logged.
        </footer>
      </div>
    </div>
  );
}
