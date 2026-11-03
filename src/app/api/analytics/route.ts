import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getApiAdmin } from "@/lib/auth";
import { getAnalytics } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getApiAdmin();
    const analytics = await getAnalytics();
    return NextResponse.json(analytics);
  } catch (error) {
    return apiError(error);
  }
}
