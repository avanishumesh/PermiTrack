"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import { markAllReadAction, markReadAction } from "@/app/actions/notifications";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { NotificationRow } from "@/lib/types";
import type { ActionState } from "@/lib/errors";
import { formatDateTime, relativeTime, cn } from "@/lib/utils";

const initialState: ActionState = { ok: false };

export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [readState, readAction] = useActionState(markReadAction, initialState);
  const [allState, allAction] = useActionState(markAllReadAction, initialState);

  useEffect(() => {
    if (readState.ok || allState.ok) router.refresh();
  }, [readState, allState, router]);

  const unread = notifications.filter((notification) => !notification.read_at).length;

  if (notifications.length === 0) {
    return (
      <EmptyState
        title="No notifications"
        description="You will be notified when a request needs your attention, is decided, or when someone asks a question."
        icon={<Bell className="h-6 w-6" />}
        className="py-12"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {unread > 0 ? `${unread} unread` : "You are all caught up"}
        </p>
        {unread > 0 ? (
          <form action={allAction}>
            <SubmitButton variant="outline" size="sm" pendingLabel="Marking…">
              <CheckCheck className="h-4 w-4" /> Mark all as read
            </SubmitButton>
          </form>
        ) : null}
      </div>

      <ul className="divide-y rounded-lg border">
        {notifications.map((notification) => {
          const isUnread = !notification.read_at;
          return (
            <li
              key={notification.id}
              className={cn("flex flex-wrap items-start gap-3 p-4", isUnread && "bg-primary/[0.03]")}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  isUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <Bell className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", isUnread ? "font-semibold" : "font-medium")}>
                  {notification.title}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                  {notification.body}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatDateTime(notification.created_at)} · {relativeTime(notification.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {notification.link ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={notification.link}>
                      Open <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
                {isUnread ? (
                  <form action={readAction}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <Check className="h-4 w-4" /> Mark read
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
