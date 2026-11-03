import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { STAFF_ROLES } from "@/lib/constants";
import type { UserRole, Viewer } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

function roleName(role: UserRole): string | null {
  const roles = role.roles;
  if (!roles) return null;
  if (Array.isArray(roles)) return roles[0]?.name ?? null;
  return roles.name ?? null;
}

function isWithinWindow(role: UserRole) {
  if (!role.is_active) return false;
  const now = Date.now();
  if (role.starts_at && new Date(role.starts_at).getTime() > now) return false;
  if (role.ends_at && new Date(role.ends_at).getTime() <= now) return false;
  return true;
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Offline demo sessions work without Supabase so the site can be evaluated
  // before any infrastructure is configured.
  try {
    const { getDemoViewer } = await import("@/lib/demo");
    const demo = await getDemoViewer();
    if (demo) return demo;
  } catch {
    // Fall through to the real session lookup.
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    // Missing/invalid env: treat as signed out instead of crashing layouts.
    return null;
  }

  let user: { id: string; email?: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null;
  } catch {
    return null;
  }

  if (!user) return null;

  let profile: unknown = null;
  let roleRows: unknown = null;
  try {
    const [profileResult, rolesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, email, department_id, is_active, created_at, updated_at, departments(name)")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("id, user_id, role_id, department_id, is_active, starts_at, ends_at, roles(name)")
        .eq("user_id", user.id),
    ]);
    if (profileResult.error || rolesResult.error) return null;
    profile = profileResult.data;
    roleRows = rolesResult.data;
  } catch {
    // Database unreachable or migrations not applied: do not crash the shell.
    return null;
  }

  if (!profile) return null;

  const typed = profile as unknown as Record<string, any>;
  const activeRoles = ((roleRows ?? []) as unknown as UserRole[])
    .filter(isWithinWindow)
    .map(roleName)
    .filter((name): name is string => Boolean(name));

  const roles = Array.from(new Set(activeRoles));
  const department = (typed as unknown as { departments?: { name: string } | null }).departments;

  return {
    user: { id: user.id, email: user.email },
    profile: {
      id: String(typed.id ?? user.id),
      name: String(typed.name ?? "Account"),
      email: String(typed.email ?? user.email ?? ""),
      department_id: (typed.department_id as string | null) ?? null,
      is_active: Boolean(typed.is_active ?? true),
      created_at: String(typed.created_at ?? new Date().toISOString()),
      updated_at: String(typed.updated_at ?? new Date().toISOString()),
    },
    roles,
    isAdmin: roles.includes("admin"),
    isStaff: roles.some((role) => (STAFF_ROLES as readonly string[]).includes(role)),
    departmentName: department?.name ?? null,
  };
});

export async function requireViewer(options: { next?: string } = {}): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(`/login${options.next ? `?next=${encodeURIComponent(options.next)}` : ""}`);
  }
  return viewer;
}

export async function requireActiveViewer(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.profile.is_active) redirect("/pending?reason=inactive");
  return viewer;
}

export async function requireAdminViewer(): Promise<Viewer> {
  const viewer = await requireActiveViewer();
  if (!viewer.isAdmin) redirect("/dashboard?denied=admin");
  return viewer;
}

/** API route variant: throws instead of redirecting. */
export async function getApiViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AppError("PT401", "Authentication required.", 401);
  if (!viewer.profile.is_active) {
    throw new AppError("PT403", "Your account is inactive.", 403);
  }
  return viewer;
}

export async function getApiAdmin(): Promise<Viewer> {
  const viewer = await getApiViewer();
  if (!viewer.isAdmin) {
    throw new AppError("PT403", "Administrator privileges are required.", 403);
  }
  return viewer;
}
