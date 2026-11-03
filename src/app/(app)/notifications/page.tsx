import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { Card, CardContent } from "@/components/ui/card";
import { requireActiveViewer } from "@/lib/auth";
import { listNotifications } from "@/lib/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireActiveViewer();
  const notifications = await listNotifications();

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Decisions, assignments, questions and re-approval notices for requests you are involved in."
      />
      <Card>
        <CardContent className="p-4">
          <NotificationList notifications={notifications} />
        </CardContent>
      </Card>
    </>
  );
}
