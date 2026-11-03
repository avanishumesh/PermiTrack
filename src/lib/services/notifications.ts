import "server-only";
import { callRpc, createClient } from "@/lib/supabase/server";
import { demoActor, demoMarkAllRead, demoMarkRead, demoNotificationsFor, getDemoSession } from "@/lib/demo";
import type { NotificationRow } from "@/lib/types";

export async function listNotifications(limit = 60) {
  const demoRole = await getDemoSession();
  if (demoRole) {
    const actor = await demoActor();
    return demoNotificationsFor(actor.id).slice(0, limit) as NotificationRow[];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function unreadNotificationCount() {
  const demoRole = await getDemoSession().catch(() => null);
  if (demoRole) {
    const actor = await demoActor();
    return demoNotificationsFor(actor.id).filter((n) => !n.read_at).length;
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return 0;
  }

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    return 0;
  }
  if (!userId) return 0;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) return 0;
  return count ?? 0;
}

export async function markNotificationRead(id: string) {
  const demoRole = await getDemoSession().catch(() => null);
  if (demoRole) {
    const actor = await demoActor();
    demoMarkRead(id, actor.id);
    return;
  }
  return callRpc<void>("api_mark_notification_read", { p_notification_id: id });
}

export async function markAllNotificationsRead() {
  const demoRole = await getDemoSession().catch(() => null);
  if (demoRole) {
    const actor = await demoActor();
    demoMarkAllRead(actor.id);
    return;
  }
  return callRpc<void>("api_mark_all_notifications_read");
}
