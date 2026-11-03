import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client. Only used for operations that cannot be expressed with a
 * user session (creating auth users, deleting orphaned storage objects) and
 * always AFTER an explicit admin authorization check.
 */
export function createAdminClient() {
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
