import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const SUPABASE_STUBS = `
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'sub', '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role noinherit;
  end if;
end;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function createTestDatabase(options: { skipStorage?: boolean } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !(options.skipStorage && f.includes("storage")))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      console.error(`\nMigration failed: ${file}\n`);
      throw error;
    }
  }

  return db;
}

export type Db = PGlite;

export async function asUser<T>(db: Db, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify(userId ? { sub: userId, role: "authenticated" } : {}),
  ]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

export async function asSystem(db: Db, fn: () => Promise<void>) {
  await db.exec("reset role");
  await fn();
}

export async function assertRaises(
  fn: () => Promise<unknown>,
  matcher: RegExp | string,
  label?: string
) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const re = typeof matcher === "string" ? new RegExp(matcher, "i") : matcher;
    if (!re.test(message)) {
      throw new Error(
        `${label ?? "Expected error"} did not match ${re}.\nReceived: ${message}`
      );
    }
    return message;
  }
  throw new Error(`${label ?? "Expected error"} was not raised (pattern ${matcher}).`);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${e}\n  actual:   ${a}`);
  }
}
