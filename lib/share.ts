import { randomBytes } from "node:crypto";
import type { AttentionItem, Digest, Entry, Provider, ShareState, Stage, Triage } from "./types";
import { SHARE_AUTO, WITHHOLD_AUTO } from "./types";
import { readJson, writeJson } from "./store";

const SHARE_FILE = "share.json";

export function defaultShareState(digest: Digest | null): ShareState {
  const lienProvider = digest?.providers.find((p) => p.payer === "lien") ?? digest?.providers[0];
  return {
    provider: lienProvider?.name ?? "",
    decisions: {},
    showCoverage: true,
    token: null,
    sharedAt: null,
    opens: [],
  };
}

export async function loadShareState(digest: Digest | null): Promise<ShareState> {
  const saved = await readJson<ShareState | null>(SHARE_FILE, null);
  return saved ?? defaultShareState(digest);
}

/**
 * Provider link: verify the token, log the open (attorneys asked "has anyone in
 * their office opened it?"), and return only the provider-safe projection.
 */
export async function openSharedView(
  digest: Digest,
  token: string,
  userAgent: string,
): Promise<ProviderView | null> {
  const share = await loadShareState(digest);
  if (!share.token || share.token !== token) return null;
  share.opens = [...share.opens, { at: new Date().toISOString(), userAgent: userAgent.slice(0, 200) }].slice(-200);
  await saveShareState(share);
  return buildProviderView(digest, share);
}

export async function saveShareState(state: ShareState): Promise<void> {
  await writeJson(SHARE_FILE, state);
}

export function newShareToken(): string {
  return randomBytes(18).toString("base64url");
}

export interface ShareItem {
  entry: Entry;
  triage: Triage;
  /** Final decision after the attorney's overrides. */
  decision: "share" | "withhold" | "review";
  /** True when the attorney set it by hand. */
  manual: boolean;
}

/** Sort every triaged entry into share / needs-review / withhold. */
export function shareBuckets(digest: Digest, share: ShareState) {
  const items: ShareItem[] = [];
  for (const triage of Object.values(digest.triage)) {
    const entry = digest.entries[triage.entryId];
    if (!entry) continue;
    const manual = share.decisions[triage.entryId];
    let decision: ShareItem["decision"];
    if (manual) decision = manual;
    else if (triage.shareable >= SHARE_AUTO) decision = "share";
    else if (triage.shareable <= WITHHOLD_AUTO) decision = "withhold";
    else decision = "review";
    items.push({ entry, triage, decision, manual: Boolean(manual) });
  }
  const byConfidence = (a: ShareItem, b: ShareItem) => b.triage.shareable - a.triage.shareable;
  return {
    review: items.filter((i) => i.decision === "review").sort(byConfidence),
    share: items.filter((i) => i.decision === "share").sort(byConfidence),
    withhold: items.filter((i) => i.decision === "withhold").sort((a, b) => a.triage.shareable - b.triage.shareable),
  };
}

/** Everything a treating provider is allowed to see. Built server-side; nothing else leaves. */
export interface ProviderView {
  providerName: string;
  patientName: string;
  stage: Stage;
  /** Last time the case moved (latest shared status change). */
  lastMovement: { date: string | null; daysAgo: number | null; text: string | null };
  active: boolean;
  /** null = attorney chose not to show coverage. Never an amount. */
  coverageConfirmed: boolean | null;
  provider: Provider | null;
  stillTreating: { yes: boolean | null; detail: string };
  needs: AttentionItem[];
  updates: { date: string | null; text: string }[];
  sharedAt: string | null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function buildProviderView(digest: Digest, share: ShareState): ProviderView {
  const { share: shared } = shareBuckets(digest, share);
  const provider = digest.providers.find((p) => p.name === share.provider) ?? null;
  // Match requests to THIS provider: full name, or a word in its name no other provider shares.
  const words = (n: string) => n.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const otherWords = new Set(digest.providers.filter((p) => p.name !== share.provider).flatMap((p) => words(p.name)));
  const keys = [share.provider.toLowerCase(), ...words(share.provider).filter((w) => !otherWords.has(w))].filter(Boolean);

  const updates = shared
    .filter((i) => i.triage.statusChange || i.triage.category === "bills" || i.triage.category === "treatment")
    .map((i) => ({ date: i.entry.date, text: i.entry.title }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 12);

  const latest = updates[0] ?? null;
  const treating = digest.providers.filter((p) => p.status === "treating");
  const needs = [...digest.attention.overdue, ...digest.attention.waiting, ...digest.attention.upcoming].filter((a) => {
    const hay = `${a.title} ${a.detail}`.toLowerCase();
    return keys.some((k) => hay.includes(k));
  });

  return {
    providerName: share.provider,
    patientName: digest.matter.name,
    stage: digest.stage.current,
    lastMovement: { date: latest?.date ?? null, daysAgo: daysSince(latest?.date ?? null), text: latest?.text ?? null },
    active: digest.stage.current !== "resolved",
    coverageConfirmed: share.showCoverage
      ? digest.checks.insurance.verdict === "met" || digest.checks.insurance.verdict === "warning"
      : null,
    provider,
    stillTreating: {
      yes: digest.providers.length ? treating.length > 0 : null,
      detail: treating.length
        ? treating.map((p) => `${p.specialty || p.name}${p.visitNote ? `: ${p.visitNote}` : ""}`).join(" · ")
        : "No provider is currently treating",
    },
    needs,
    updates,
    sharedAt: share.sharedAt,
  };
}
