"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ScrollText,
  Settings2,
  Users,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  requests: FileText,
  approvals: Inbox,
  notifications: Bell,
  overview: Activity,
  users: Users,
  departments: Building2,
  catalogue: ClipboardList,
  workflows: Workflow,
  monitor: Settings2,
  analytics: BarChart3,
  audit: ScrollText,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
  exact?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = ICONS[item.icon] ?? LayoutDashboard;
  const active = isActive(pathname, item);

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && item.badge > 0 ? (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppNav({
  sections,
  variant = "desktop",
}: {
  sections: NavSection[];
  variant?: "desktop" | "mobile";
}) {
  const pathname = usePathname();

  if (variant === "mobile") {
    return (
      <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 scrollbar-thin lg:hidden">
        {sections.flatMap((section) => section.items).map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
              {item.badge && item.badge > 0 ? (
                <span className="rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="hidden flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 lg:flex">
      {sections.map((section, index) => (
        <div key={section.label ?? index} className="space-y-1">
          {section.label ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {section.label}
            </p>
          ) : null}
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      ))}
    </nav>
  );
}
