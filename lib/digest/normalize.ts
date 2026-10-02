import { CLIO_BASE } from "../config";
import type { MatterBundle } from "../clio/bundle";
import type { Entry, EntryKind } from "../types";

type Row = Record<string, unknown>;

const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const name = (v: unknown): string => s((v as { name?: unknown } | null)?.name);
const names = (v: unknown): string =>
  Array.isArray(v) ? v.map(name).filter(Boolean).join(", ") : "";

export function dateOnly(v: unknown): string | null {
  const str = s(v);
  if (!str) return null;
  const m = str.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function firstLine(text: string, max = 90): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return clip(line, max);
}

export function matterUrl(matterId: number): string {
  return `${CLIO_BASE}/nc/#/matters/${matterId}`;
}

/** "04-medical-records__created__mcculloch-orthopaedic-records-2023-05-17.pdf" -> "Mcculloch orthopaedic records 2023-05-17" */
export function prettyDocName(file: string): string {
  const base = file.replace(/\.[a-z0-9]{2,5}$/i, "");
  const last = base.split("__").filter(Boolean).pop() ?? base;
  const words = last.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$1·$2·$3").replace(/[-_]+/g, " ").replace(/·/g, "-").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : file;
}

/** Normalize every Clio record of the matter into one list of Entries. */
export function normalize(bundle: MatterBundle): Entry[] {
  const matterId = Number(bundle.matter.id);
  const back = matterUrl(matterId);
  const out: Entry[] = [];
  const push = (kind: EntryKind, row: Row, fields: Omit<Entry, "id" | "kind" | "clioId" | "updatedAt" | "url"> & { url?: string }) => {
    const clioId = Number(row.id);
    out.push({
      id: `${kind}:${clioId}`,
      kind,
      clioId,
      updatedAt: s(row.updated_at) || s(row.created_at) || null,
      url: fields.url ?? back,
      ...fields,
      title: fields.title || `${kind} ${clioId}`,
    });
  };

  for (const r of bundle.notes) {
    const detail = s(r.detail);
    push("note", r, {
      date: dateOnly(r.date) ?? dateOnly(r.created_at),
      title: s(r.subject) || firstLine(detail),
      text: clip(detail, 4000),
      author: name(r.author) || null,
    });
  }
  for (const r of bundle.communications) {
    const body = s(r.body);
    const type = s(r.type).replace("Communication", "").toLowerCase();
    push("email", r, {
      date: dateOnly(r.date) ?? dateOnly(r.created_at),
      title: s(r.subject) || firstLine(body) || `${type || "message"}`,
      text: clip([names(r.senders) && `From: ${names(r.senders)}`, names(r.receivers) && `To: ${names(r.receivers)}`, body].filter(Boolean).join("\n"), 4000),
      author: names(r.senders) || null,
    });
  }
  for (const r of bundle.tasks) {
    const status = s(r.status);
    push("task", r, {
      date: dateOnly(r.due_at) ?? dateOnly(r.created_at),
      title: s(r.name),
      text: clip([s(r.description), status && `Status: ${status}`, s(r.due_at) && `Due: ${dateOnly(r.due_at)}`, name(r.assignee) && `Assignee: ${name(r.assignee)}`].filter(Boolean).join("\n"), 2000),
      author: name(r.assignee) || null,
    });
  }
  for (const r of bundle.calendar_entries) {
    push("calendar", r, {
      date: dateOnly(r.start_at),
      title: s(r.summary),
      text: clip([s(r.description), s(r.location) && `Location: ${s(r.location)}`].filter(Boolean).join("\n"), 2000),
      author: null,
    });
  }
  for (const r of bundle.documents) {
    const category = name(r.document_category);
    const folder = name(r.parent);
    push("document", r, {
      date: dateOnly(r.created_at),
      title: prettyDocName(s(r.name)),
      text: [folder && `Folder: ${folder}`, category && `Category: ${category}`, `File: ${s(r.name)}`].filter(Boolean).join("\n"),
      author: null,
      url: `/api/documents/${Number(r.id)}`,
    });
  }
  for (const r of bundle.activities) {
    const isExpense = s(r.type).toLowerCase().includes("expense");
    const total = Number(r.total ?? 0);
    push(isExpense ? "expense" : "time", r, {
      date: dateOnly(r.date),
      title: s(r.note) ? firstLine(s(r.note)) : isExpense ? "Expense" : "Time entry",
      text: clip([s(r.note), `Amount: $${total.toFixed(2)}`, name(r.user) && `By: ${name(r.user)}`].filter(Boolean).join("\n"), 1500),
      author: name(r.user) || null,
    });
  }
  for (const r of bundle.relationships) {
    const c = (r.contact ?? {}) as Row;
    const email = s((c.primary_email_address as Row | undefined)?.address ?? c.primary_email_address);
    const phone = s((c.primary_phone_number as Row | undefined)?.number ?? c.primary_phone_number);
    push("contact", r, {
      date: null,
      title: [s(c.name), s(r.description)].filter(Boolean).join(" · "),
      text: [s(r.description), email && `Email: ${email}`, phone && `Phone: ${phone}`].filter(Boolean).join("\n"),
      author: null,
    });
  }
  return out;
}

/** Matter custom fields as "name: value" pairs (often the most reliable facts). */
export function customFields(bundle: MatterBundle): { name: string; value: string }[] {
  const list = (bundle.matter.custom_field_values ?? []) as Row[];
  return list
    .map((cf) => ({ name: s(cf.field_name) || `field ${s(cf.id)}`, value: s(cf.value) }))
    .filter((cf) => cf.value);
}

/** Dollar total of expense entries. */
export function expenseTotal(bundle: MatterBundle): number {
  return bundle.activities
    .filter((r) => s(r.type).toLowerCase().includes("expense"))
    .reduce((sum, r) => sum + Number(r.total ?? 0), 0);
}
