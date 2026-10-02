import { createHash } from "node:crypto";
import { fetchMatterBundle } from "../clio/bundle";
import { newUsage } from "../llm";
import { DIGEST_FILE } from "../data";
import { readJson, writeJson } from "../store";
import type { Digest } from "../types";
import { enrichDocEntries, readDocuments } from "./documents";
import { normalize } from "./normalize";
import { synthesize, synthesizeInput } from "./synthesize";
import { triageEntries } from "./triage";

/**
 * The digest pipeline. Runs in the background; the UI polls getStatus().
 *   1. Pull the matter live from Clio (read-only).
 *   2. Read each document once per version (cached).
 *   3. Triage each entry once per version (cached).
 *   4. Write the brief (one call), then cache it so opening the case never re-digests.
 */

export interface DigestStatus {
  running: boolean;
  step: string;
  progress: { done: number; total: number } | null;
  error: string | null;
  warnings: string[];
  finishedAt: string | null;
}

const g = globalThis as unknown as { __digestStatus?: DigestStatus };
const status = (): DigestStatus =>
  (g.__digestStatus ??= { running: false, step: "", progress: null, error: null, warnings: [], finishedAt: null });

export function getStatus(): DigestStatus {
  return { ...status() };
}

function set(patch: Partial<DigestStatus>) {
  Object.assign(status(), patch);
}

export function startDigest(): boolean {
  if (status().running) return false;
  set({ running: true, step: "Starting", progress: null, error: null, warnings: [] });
  void run().catch((err: unknown) => {
    console.error("[digest] failed", err);
    set({ running: false, error: (err as Error).message ?? String(err), step: "Failed" });
  });
  return true;
}

async function run(): Promise<void> {
  const usage = newUsage();
  const t0 = Date.now();

  set({ step: "Reading the case from Clio", progress: null });
  const bundle = await fetchMatterBundle();
  set({ warnings: bundle.warnings });
  const entries = normalize(bundle);

  const docEntries = entries.filter((e) => e.kind === "document");
  set({ step: "Reading documents", progress: { done: 0, total: docEntries.length } });
  const docs = await readDocuments(docEntries, usage, (done, total) => set({ progress: { done, total } }));
  enrichDocEntries(entries, docs);
  const unreadable = Object.entries(docs).filter(([, d]) => d.error);
  if (unreadable.length) set({ warnings: [...status().warnings, `${unreadable.length} document(s) could not be read`] });

  set({ step: `Triaging ${entries.length} entries`, progress: { done: 0, total: 1 } });
  const triage = await triageEntries(entries, usage, (done, total) => set({ progress: { done, total } }));

  set({ step: "Writing the brief", progress: null });
  // Skip the brief-writing call entirely when nothing in the case changed since the last digest.
  const inputHash = createHash("sha256").update(synthesizeInput(bundle, entries, triage)).digest("hex");
  const previous = await readJson<(Digest & { inputHash?: string }) | null>(DIGEST_FILE, null);
  const digest =
    previous && previous.inputHash === inputHash
      ? { ...previous, generatedAt: new Date().toISOString() }
      : { ...(await synthesize(bundle, entries, triage, docs, usage)), inputHash };
  await writeJson(DIGEST_FILE, digest);

  const log = await readJson<unknown[]>("usage-log.json", []);
  log.push({
    at: digest.generatedAt,
    seconds: Math.round((Date.now() - t0) / 1000),
    entries: entries.length,
    documents: docEntries.length,
    ...usage,
  });
  await writeJson("usage-log.json", log);

  set({ running: false, step: "Done", progress: null, finishedAt: new Date().toISOString() });
}
