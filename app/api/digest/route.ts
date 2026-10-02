import { NextResponse } from "next/server";
import { loadDigest } from "@/lib/data";
import { getStatus, startDigest } from "@/lib/digest/run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const s = getStatus();
  const hasDigest = Boolean(await loadDigest());
  return NextResponse.json({ ...s, hasDigest });
}

export async function POST() {
  const started = startDigest();
  return NextResponse.json({ started, ...getStatus() }, { status: started ? 202 : 200 });
}
