import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "permitrack",
    time: new Date().toISOString(),
    integrations: {
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      email: Boolean(process.env.RESEND_API_KEY),
      ai: Boolean(process.env.AI_API_KEY),
    },
  });
}
