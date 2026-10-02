import Link from "next/link";
import { redirect } from "next/navigation";
import type { Digest, Provider } from "@/lib/types";
import { isConnected, loadDigest } from "@/lib/data";
import { loadShareState, shareBuckets, type ShareItem } from "@/lib/share";
import { SourcesProvider } from "@/components/Sources";
import { TopBar } from "@/components/TopBar";
import { CoverageToggle, DecidedColumn, ProviderSelect, ReviewColumn, SendLink, type ShareRow } from "@/components/ShareReview";
import { EyeIcon } from "@/components/icons";
import { KIND_LABEL, plural, shortDate } from "@/components/format";

export const dynamic = "force-dynamic";

function toRow(item: ShareItem): ShareRow {
  const e = item.entry;
  const kind = KIND_LABEL[e.kind] ?? String(e.kind).toUpperCase();
  const when = e.date ?? e.updatedAt;
  return {
    entryId: e.id,
    title: e.title || "Untitled entry",
    shareable: item.triage.shareable,
    reason: item.triage.reason,
    manual: item.manual,
    source: { entryId: e.id, label: when ? `${kind} · ${shortDate(when).toUpperCase()}` : kind },
  };
}

function relationship(p: Provider | null): string | null {
  if (!p) return null;
  const status: Record<string, string> = {
    treating: "Treating",
    gap: "Gap in treatment",
    finished: "Finished treating",
    unknown: "",
  };
  const payer: Record<string, string> = {
    lien: "on a lien",
    health_insurance: "billed to health insurance",
    paid: "bills paid",
    unknown: "",
  };
  const s = [status[p.status], payer[p.payer]].filter(Boolean).join(" ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}

export default async function SharePage() {
  const digest = await loadDigest();
  if (!digest) {
    if (!(await isConnected())) redirect("/");
    redirect("/matter");
  }
  return <ShareReviewScreen digest={digest} />;
}

async function ShareReviewScreen({ digest }: { digest: Digest }) {
  const share = await loadShareState(digest);
  const buckets = shareBuckets(digest, share);
  const providers = (digest.providers ?? []).map((p) => p.name).filter(Boolean);
  const provider = digest.providers?.find((p) => p.name === share.provider) ?? null;
  const total = buckets.review.length + buckets.share.length + buckets.withhold.length;

  const lastOpen = [...(share.opens ?? [])].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const rel = relationship(provider);

  return (
    <SourcesProvider entries={digest.entries ?? {}}>
      <TopBar active="share" right={<span>{digest.matter.name}</span>} />
      <main className="page">
        <section
          aria-label="Who you are sharing with"
          className="card card-lg"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}
        >
          <div style={{ minWidth: 260, flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="label">Share with a treating provider</div>
            <ProviderSelect providers={providers} current={share.provider} />
            <div className="muted">
              {rel && <>{rel} · </>}
              {share.sharedAt ? `last shared ${shortDate(share.sharedAt)}` : "not shared yet"}
              {share.sharedAt && (
                <>
                  {" · "}
                  {lastOpen ? (
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>opened {shortDate(lastOpen.at)}</span>
                  ) : (
                    <span>not opened yet</span>
                  )}
                </>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <CoverageToggle key={String(share.showCoverage)} show={share.showCoverage} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Link href="/matter/share/preview" className="btn">
              <EyeIcon />
              Preview what they see
            </Link>
            <SendLink existingUrl={share.token ? `/p/${share.token}` : null} disabled={!share.provider} />
          </div>
        </section>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", padding: "0 4px" }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>The triage model sorted {plural(total, "entry", "entries")}.</span>
          <span className="muted">
            You only decide the {buckets.review.length} it isn&apos;t sure about. Every entry shows how confident it was.
          </span>
        </div>

        <div className="row row-top">
          <ReviewColumn items={buckets.review.map(toRow)} />
          <DecidedColumn kind="share" items={buckets.share.map(toRow)} />
          <DecidedColumn kind="withhold" items={buckets.withhold.map(toRow)} />
        </div>
      </main>
    </SourcesProvider>
  );
}
