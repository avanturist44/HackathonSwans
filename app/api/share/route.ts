import { NextRequest, NextResponse } from "next/server";
import { loadDigest } from "@/lib/data";
import { loadShareState, newShareToken, saveShareState } from "@/lib/share";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body =
  | { action: "decide"; entryId: string; decision: "share" | "withhold" | null }
  | { action: "provider"; provider: string }
  | { action: "coverage"; show: boolean }
  | { action: "link" };

/** Share decisions live in our own store (.data/share.json). Nothing is written to Clio. */
export async function POST(req: NextRequest) {
  const digest = await loadDigest();
  if (!digest) return NextResponse.json({ error: "Build the case brief first." }, { status: 409 });
  const share = await loadShareState(digest);
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  switch (body.action) {
    case "decide": {
      if (!digest.entries[body.entryId]) return NextResponse.json({ error: "Unknown entry" }, { status: 400 });
      if (body.decision === "share" || body.decision === "withhold") share.decisions[body.entryId] = body.decision;
      else delete share.decisions[body.entryId];
      break;
    }
    case "provider": {
      if (!digest.providers.some((p) => p.name === body.provider)) {
        return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
      }
      if (share.provider !== body.provider) {
        // A new recipient gets a fresh link and a clean open log.
        Object.assign(share, { provider: body.provider, token: null, sharedAt: null, opens: [] });
      }
      break;
    }
    case "coverage":
      share.showCoverage = Boolean(body.show);
      break;
    case "link": {
      share.token ??= newShareToken();
      share.sharedAt = new Date().toISOString();
      await saveShareState(share);
      return NextResponse.json({ share, url: `/p/${share.token}` });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  await saveShareState(share);
  return NextResponse.json({ share });
}
