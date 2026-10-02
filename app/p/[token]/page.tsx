import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadDigest } from "@/lib/data";
import { openSharedView } from "@/lib/share";
import { ProviderView } from "@/components/ProviderView";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Case status · CaseBrief",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The real provider page. Token-gated; each open is logged by openSharedView. */
export default async function SharedProviderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const digest = await loadDigest();
  if (!digest) notFound();
  const h = await headers();
  const view = await openSharedView(digest, token, h.get("user-agent") ?? "");
  if (!view) notFound();

  return (
    <>
      <TopBar active={null} showTabs={false} right={<span>Shared with {view.providerName || "your office"}</span>} />
      <ProviderView view={view} />
    </>
  );
}
