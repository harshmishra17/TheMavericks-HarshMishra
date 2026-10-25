import { NextRequest, NextResponse } from "next/server";
import { serverDB } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const db = await serverDB();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/customer/jobs", request.url));
  }
  return NextResponse.redirect(
    new URL("/login?confirmation=failed", request.url),
  );
}
