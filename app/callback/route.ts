import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/clio/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** OAuth redirect target. Matches the redirect URI registered on the Clio app (http://127.0.0.1:8765/callback). */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const error = url.searchParams.get("error");
  if (error) return new NextResponse(`Clio authorization failed: ${error}`, { status: 400 });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get("clio_oauth_state")?.value;
  if (!code || !state || state !== expected) {
    return new NextResponse("Invalid OAuth state. Start again from the home page.", { status: 400 });
  }
  try {
    await exchangeCode(code);
  } catch (err) {
    return new NextResponse((err as Error).message, { status: 502 });
  }
  const res = NextResponse.redirect(new URL("/matter", url.origin));
  res.cookies.delete("clio_oauth_state");
  return res;
}
