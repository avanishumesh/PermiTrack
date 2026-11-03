export class AppError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

const SQLSTATE_STATUS: Record<string, number> = {
  PT400: 400,
  PT401: 401,
  PT403: 403,
  PT404: 404,
  PT409: 409,
  PT422: 422,
  PT428: 428,
};

const SQLSTATE_MESSAGES: Record<string, string> = {
  "23505": "That record already exists.",
  "23503": "A related record is missing or still in use.",
  "23514": "The data violates a database rule.",
  "42501": "You do not have permission to do that.",
};

/**
 * Convert a Postgres/Supabase error into a safe user-facing error. Our engine
 * raises SQLSTATEs in the PT4xx range with human readable messages.
 */
export function mapDbError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const source = error as { message?: string; code?: string; details?: string; hint?: string };
  const raw = source?.message ?? "Something went wrong.";
  const sqlstate = source?.code ?? "";

  // PostgREST surfaces "PT403: message" when RAISE EXCEPTION includes ERRCODE.
  const prefixed = raw.match(/^(PT\d{3}):\s*([\s\S]+)$/);
  if (prefixed) {
    return new AppError(
      prefixed[1],
      prefixed[2].split("\n")[0].trim(),
      SQLSTATE_STATUS[prefixed[1]] ?? 400
    );
  }

  if (sqlstate && SQLSTATE_STATUS[sqlstate]) {
    return new AppError(sqlstate, raw, SQLSTATE_STATUS[sqlstate]);
  }

  if (sqlstate && SQLSTATE_MESSAGES[sqlstate]) {
    return new AppError(sqlstate, SQLSTATE_MESSAGES[sqlstate], 400);
  }

  // Never leak SQL internals to the client.
  if (/duplicate key|violates|permission denied|relation "|column "/i.test(raw)) {
    return new AppError("DB_ERROR", "The operation could not be completed.", 400);
  }

  return new AppError("DB_ERROR", raw, 400);
}

export function toErrorMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Set when the caller should navigate after a successful action. */
  redirectTo?: string;
}

export function actionError(error: unknown): ActionState {
  return { ok: false, message: toErrorMessage(error) };
}

export function isNextRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: string }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
