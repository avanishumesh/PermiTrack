import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { AppError, mapDbError } from "@/lib/errors";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component: middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * Call a SECURITY DEFINER RPC and normalize errors. Never call this with a
 * service-role client for user actions: authorization derives from auth.uid()
 * and must stay tied to the signed-in user.
 */
export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}

export async function requireRpcUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new AppError("PT401", "Authentication required.", 401);
  }
  return { supabase, user };
}
