"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveViewer } from "@/lib/auth";
import { actionError, type ActionState } from "@/lib/errors";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/services/notifications";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function markReadAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();
  const id = String(formData.get("notificationId") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, message: "Invalid notification." };

  try {
    await markNotificationRead(id);
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return { ok: true, message: "Marked as read." };
  } catch (error) {
    return actionError(error);
  }
}

export async function markAllReadAction(): Promise<ActionState> {
  await requireActiveViewer();
  try {
    await markAllNotificationsRead();
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return { ok: true, message: "All notifications marked as read." };
  } catch (error) {
    return actionError(error);
  }
}

export async function openNotificationAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();
  const id = String(formData.get("notificationId") ?? "");
  const link = String(formData.get("link") ?? "");

  if (UUID_RE.test(id)) {
    try {
      await markNotificationRead(id);
    } catch {
      // Navigation should still work if the marker fails.
    }
  }

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  redirect(link.startsWith("/") && !link.startsWith("//") ? link : "/notifications");
}
