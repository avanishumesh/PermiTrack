import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/approvals", label: "Inbox", key: "inbox" },
  { href: "/approvals/overdue", label: "Overdue", key: "overdue" },
  { href: "/approvals/completed", label: "Completed", key: "completed" },
];

export function ApprovalTabs({
  active,
  counts,
}: {
  active: string;
  counts?: { inbox?: number; overdue?: number };
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TABS.map((tab) => {
        const current = tab.key === active;
        const count =
          tab.key === "inbox" ? counts?.inbox : tab.key === "overdue" ? counts?.overdue : undefined;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              current
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
            {count ? (
              <span
                className={cn(
                  "rounded-full px-1 text-[10px]",
                  current ? "bg-primary-foreground/20" : "bg-muted-foreground/15"
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
