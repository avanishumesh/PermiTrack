import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getApiViewer } from "@/lib/auth";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/services/notifications";
import { notificationReadSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getApiViewer();
    const notifications = await listNotifications();
    return NextResponse.json({
      notifications: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        readAt: notification.read_at,
        createdAt: notification.created_at,
      })),
      unread: notifications.filter((notification) => !notification.read_at).length,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await getApiViewer();
    const body = await request.json().catch(() => null);
    const parsed = notificationReadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notification payload." }, { status: 422 });
    }

    if (parsed.data.all) {
      await markAllNotificationsRead();
      return NextResponse.json({ ok: true, marked: "all" });
    }

    if (parsed.data.notificationId) {
      await markNotificationRead(parsed.data.notificationId);
      return NextResponse.json({ ok: true, marked: parsed.data.notificationId });
    }

    return NextResponse.json(
      { error: "Provide a notificationId or set all to true." },
      { status: 422 }
    );
  } catch (error) {
    return apiError(error);
  }
}
