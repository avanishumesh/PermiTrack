"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE_NAME, isDemoRole } from "@/lib/demo";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";
import type { ActionState } from "@/lib/errors";

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return {
      ok: false,
      message: "The database is not configured yet. Try a demo login below instead.",
    };
  }
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, message: "Incorrect email or password." };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

/** One-click offline login for evaluating the site without Supabase. */
export async function demoLoginAction(role: string) {
  if (!isDemoRole(role)) throw new Error("Unknown demo role.");
  const store = await cookies();
  store.set(DEMO_COOKIE_NAME, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function registerAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name } },
  });

  if (error) {
    return {
      ok: false,
      message: error.message.includes("already")
        ? "An account with that email already exists."
        : "The account could not be created. Please try again.",
    };
  }

  if (!data.session) {
    return {
      ok: true,
      message:
        "Account created. Check your inbox to confirm your email address, then sign in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logoutAction() {
  try {
    const store = await cookies();
    store.delete(DEMO_COOKIE_NAME);
  } catch {
    // cookies() unavailable: continue with the Supabase sign-out below.
  }
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Missing env in demo mode: clearing the cookie is enough.
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
