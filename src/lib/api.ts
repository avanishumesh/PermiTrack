import "server-only";
import { NextResponse } from "next/server";
import { mapDbError } from "@/lib/errors";

/** Standard JSON error envelope for route handlers. */
export function apiError(error: unknown) {
  const app = mapDbError(error);
  return NextResponse.json({ error: app.message, code: app.code }, { status: app.status });
}

export function csvResponse(filename: string, rows: Array<Record<string, unknown>>, columns: string[]) {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escape(row[column])).join(","));
  }

  return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
