import { createHash } from "node:crypto";
import { MODEL_TRIAGE } from "../config";
import { callStructured, type Usage } from "../llm";
import { readJson, writeJson } from "../store";
import type { Category, Entry, Triage } from "../types";

/**
 * Per-entry triage: category, importance, and whether a treating provider may see it.
 * One cheap model call per batch of entries; cached per entry version, so only new or
 * changed entries are ever re-triaged.
 */

const CACHE = "triage-cache.json";
const BATCH = 25;

const CATEGORIES: Category[] = [
  "liability", "medical", "treatment", "bills", "coverage", "negotiation", "client_contact", "deadline", "admin", "other",
];

const SYSTEM = `You triage entries from a personal-injury case file (notes, emails, tasks, calendar items, documents, expenses, contacts).
For each entry return:
- category: the single best fit.
- importance 0..1: how much an attorney needs this to get up to speed. 0.9+ = facts that decide the case (fault, injuries/diagnoses, coverage/policy limits, demand/offers, deadlines). 0.1 = routine admin.
- shareable 0..1: probability it is appropriate to share with a medical provider treating the client on a lien.
  Share (high): case status changes, the provider's own bills/records/requests, scheduling of treatment, records requests to providers, whether coverage exists (not amounts).
  Withhold (low): case strategy, valuation, settlement or offer numbers, policy limit amounts, attorney-client communications, client's private matters, internal admin, time entries.
  Uncertain (middle): other providers' records, anything about prior injuries, lien negotiations.
- status_change: true when the entry marks the case moving (demand sent, offer, suit filed, treatment finished, settlement).
- reason: under 12 words, plain English, why you scored shareable that way.
Judge only from the entry's content.`;

const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          importance: { type: "number", minimum: 0, maximum: 1 },
          shareable: { type: "number", minimum: 0, maximum: 1 },
          status_change: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["id", "category", "importance", "shareable", "status_change", "reason"],
      },
    },
  },
  required: ["results"],
};

type Raw = { results: { id: string; category: Category; importance: number; shareable: number; status_change: boolean; reason: string }[] };

function key(e: Entry): string {
  return `${e.id}@${createHash("sha1").update(`${e.updatedAt}|${e.title}|${e.text}`).digest("hex").slice(0, 12)}`;
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);

export async function triageEntries(
  entries: Entry[],
  usage: Usage,
  onProgress: (done: number, total: number) => void,
): Promise<Record<string, Triage>> {
  const cache = await readJson<Record<string, Triage>>(CACHE, {});
  const out: Record<string, Triage> = {};
  const todo: Entry[] = [];
  for (const e of entries) {
    const hit = cache[key(e)];
    if (hit) out[e.id] = hit;
    else todo.push(e);
  }
  const batches: Entry[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  let done = 0;
  onProgress(done, batches.length);

  const queue = [...batches];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const batch = queue.shift()!;
      const listing = batch
        .map((e) => `### ${e.id}\nkind: ${e.kind} · date: ${e.date ?? "unknown"}\ntitle: ${e.title}\n${e.text.slice(0, 900)}`)
        .join("\n\n");
      const raw = await callStructured<Raw>({
        model: MODEL_TRIAGE,
        system: SYSTEM,
        content: [{ type: "text", text: `Triage these ${batch.length} entries. Return one result per id.\n\n${listing}` }],
        toolName: "record_triage",
        toolDescription: "Record the triage result for every entry.",
        schema: SCHEMA,
        maxTokens: 4000,
        usage,
      });
      const byId = new Map(raw.results.map((r) => [r.id, r]));
      for (const e of batch) {
        const r = byId.get(e.id);
        const t: Triage = r
          ? {
              entryId: e.id,
              category: CATEGORIES.includes(r.category) ? r.category : "other",
              importance: clamp(r.importance),
              shareable: clamp(r.shareable),
              statusChange: Boolean(r.status_change),
              reason: String(r.reason ?? "").slice(0, 120),
            }
          : { entryId: e.id, category: "other", importance: 0.3, shareable: 0.5, statusChange: false, reason: "Not scored" };
        out[e.id] = t;
        if (r) cache[key(e)] = t;
      }
      await writeJson(CACHE, cache);
      onProgress(++done, batches.length);
    }
  });
  await Promise.all(workers);
  return out;
}
