import { NextResponse } from "next/server";
import { downloadDocument } from "@/lib/clio/api";
import { loadDigest } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Read-only proxy so "open the original" works without exposing the Clio token to the browser. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const docId = Number(id);
  const digest = await loadDigest();
  const entry = digest?.entries[`document:${docId}`];
  if (!Number.isInteger(docId) || !entry) return NextResponse.json({ error: "Unknown document" }, { status: 404 });
  try {
    const { bytes, contentType } = await downloadDocument(docId);
    const filename = entry.title.replace(/[^\w.\- ]+/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
