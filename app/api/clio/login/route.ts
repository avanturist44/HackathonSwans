import { NextResponse } from "next/server";
import { assertClientConfig, authorizeUrl, newState } from "@/lib/clio/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    assertClientConfig();
  } catch (err) {
    return new NextResponse((err as Error).message, { status: 500 });
  }
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("clio_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
