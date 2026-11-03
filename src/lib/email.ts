import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

interface PendingNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(notification: PendingNotification, recipientName: string) {
  const link = notification.link
    ? `${env.appUrl.replace(/\/$/, "")}${notification.link}`
    : env.appUrl;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f7fb;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:20px 24px;border-bottom:1px solid #eef0f4;">
          <span style="font-weight:700;font-size:16px;color:#4f46e5;">PermiTrack</span>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Hello ${escapeHtml(recipientName)},</p>
          <h1 style="margin:0 0 12px;font-size:18px;">${escapeHtml(notification.title)}</h1>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">${escapeHtml(notification.body)}</p>
          <a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">Open PermiTrack</a>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;border-top:1px solid #eef0f4;font-size:12px;color:#9ca3af;">
          You are receiving this email because you have a role in this permission request.
          Permission decisions are always made in the app by an authorized approver.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailConfigured() {
  return Boolean(env.resendApiKey);
}

export async function sendEmail(input: { to: string; subject: string; html: string }) {
  if (!emailConfigured()) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  return response.ok;
}

/**
 * Deliver any notification created in the last few minutes that has not been
 * emailed yet. Safe to call fire-and-forget: every failure is swallowed so a
 * mail outage can never break an approval transaction.
 */
export async function dispatchNotificationEmails() {
  if (!emailConfigured()) return { sent: 0 };

  const service = createAdminClient();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data, error } = await service
    .from("notifications")
    .select("id, user_id, title, body, link, created_at")
    .is("email_sent_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(40);

  if (error || !data) return { sent: 0 };

  const notifications = data as PendingNotification[];
  if (notifications.length === 0) return { sent: 0 };

  const userIds = Array.from(new Set(notifications.map((row) => row.user_id)));
  const { data: profiles } = await service
    .from("profiles")
    .select("id, name, email, is_active")
    .in("id", userIds);

  const profileMap = new Map(
    ((profiles ?? []) as Array<{ id: string; name: string; email: string; is_active: boolean }>).map(
      (profile) => [profile.id, profile]
    )
  );

  const delivered: string[] = [];

  for (const notification of notifications) {
    const profile = profileMap.get(notification.user_id);
    if (!profile?.is_active || !profile.email) continue;

    try {
      const ok = await sendEmail({
        to: profile.email,
        subject: notification.title,
        html: buildHtml(notification, profile.name),
      });
      if (ok) delivered.push(notification.id);
    } catch {
      // Retry on the next action; notifications stay queued.
    }
  }

  if (delivered.length > 0) {
    await service
      .from("notifications")
      .update({ email_sent_at: new Date().toISOString() })
      .in("id", delivered);
  }

  return { sent: delivered.length };
}
