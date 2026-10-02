import { MODEL_DIGEST, MODEL_TRIAGE, SOL_RULE_LABEL, SOL_YEARS } from "../config";
import type { MatterBundle } from "../clio/bundle";
import { callStructured, type Usage } from "../llm";
import type {
  AttentionItem, BodyRegion, Check, Diagnosis, Digest, Entry, Payer, Provider, SourceRef, Stage, StatuteCheck,
  TreatmentStatus, Triage, Verdict,
} from "../types";
import type { DocExtraction } from "./documents";
import { customFields, dateOnly, expenseTotal, matterUrl } from "./normalize";

type Src = { id: string; page: number | null };
type CheckRaw = { verdict: Verdict; verdict_label: string; headline: string; detail: string; sources: Src[] };
interface Raw {
  case_name: string;
  case_type: string;
  client_name: string | null;
  date_of_loss: string | null;
  date_of_loss_sources: Src[];
  stage: { current: Stage; headline: string; detail: string; sources: Src[] };
  last_client_contact: { date: string | null; how: string; sources: Src[] };
  fault: CheckRaw;
  injuries: CheckRaw;
  insurance: CheckRaw;
  checks_note: string;
  diagnoses: { name: string; body_region: BodyRegion; detail: string; primary: boolean; sources: Src[] }[];
  value: { low: number | null; high: number | null; note: string; sources: Src[] };
  coverage: { amount: number | null; note: string; sources: Src[] };
  medical_bills: { amount: number | null; note: string; sources: Src[] };
  pitch: { text: string; sources: Src[] }[];
  waiting: { title: string; detail: string; sources: Src[] }[];
  providers: {
    name: string; specialty: string; status: TreatmentStatus; last_visit: string | null; visit_note: string;
    billed: number | null; payer: Payer; note: string; sources: Src[];
  }[];
  top_entry_ids: string[];
}

const SRC = {
  type: "array",
  description: "Entry ids (exactly as given, e.g. note:123) that support this, with the page for documents when known.",
  items: {
    type: "object",
    properties: { id: { type: "string" }, page: { type: ["integer", "null"] } },
    required: ["id", "page"],
  },
};
const CHECK = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["met", "warning", "failed", "unknown"] },
    verdict_label: { type: "string", description: "1-3 words for the pill, e.g. Clear, Disputed, Documented, Check UIM, Not found." },
    headline: { type: "string", description: "Under 8 words." },
    detail: { type: "string", description: "One or two short sentences." },
    sources: SRC,
  },
  required: ["verdict", "verdict_label", "headline", "detail", "sources"],
};
const REGIONS = [
  "head", "neck", "left_shoulder", "right_shoulder", "upper_back", "lower_back", "chest", "abdomen", "left_arm",
  "right_arm", "left_hand", "right_hand", "hip", "left_knee", "right_knee", "left_leg", "right_leg", "other",
];
const MONEY = {
  type: "object",
  properties: { amount: { type: ["number", "null"] }, note: { type: "string" }, sources: SRC },
  required: ["amount", "note", "sources"],
};

const SCHEMA = {
  type: "object",
  properties: {
    case_name: { type: "string", description: "Short case name for the header, usually the client's last name or matter name." },
    case_type: { type: "string", description: "e.g. 'Personal injury · Rear-end collision'." },
    client_name: { type: ["string", "null"] },
    date_of_loss: { type: ["string", "null"], description: "YYYY-MM-DD of the incident." },
    date_of_loss_sources: SRC,
    stage: {
      type: "object",
      properties: {
        current: { type: "string", enum: ["intake", "treating", "records", "demand", "negotiation", "litigation", "resolved"] },
        headline: { type: "string", description: "One short sentence on where the case is, e.g. 'The demand is with the insurer.'" },
        detail: { type: "string", description: "Dates and what happens next, under 20 words." },
        sources: SRC,
      },
      required: ["current", "headline", "detail", "sources"],
    },
    last_client_contact: {
      type: "object",
      properties: { date: { type: ["string", "null"] }, how: { type: "string" }, sources: SRC },
      required: ["date", "how", "sources"],
    },
    fault: CHECK,
    injuries: CHECK,
    insurance: CHECK,
    checks_note: { type: "string", description: "The single most important caveat across the checks, under 10 words, lowercase start." },
    diagnoses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          body_region: { type: "string", enum: REGIONS },
          detail: { type: "string", description: "e.g. 'Lower back · confirmed on MRI · primary injury'." },
          primary: { type: "boolean" },
          sources: SRC,
        },
        required: ["name", "body_region", "detail", "primary", "sources"],
      },
    },
    value: {
      type: "object",
      properties: {
        low: { type: ["number", "null"] }, high: { type: ["number", "null"] }, note: { type: "string" }, sources: SRC,
      },
      required: ["low", "high", "note", "sources"],
    },
    coverage: MONEY,
    medical_bills: MONEY,
    pitch: {
      type: "array",
      description: "3-5 sentences: what happened and who caused it; injuries; treatment and bills; insurance, value and where it stands.",
      items: { type: "object", properties: { text: { type: "string" }, sources: SRC }, required: ["text", "sources"] },
    },
    waiting: {
      type: "array",
      description: "Things the firm is waiting on from someone else (records, bills, reports, insurer replies).",
      items: {
        type: "object",
        properties: { title: { type: "string" }, detail: { type: "string" }, sources: SRC },
        required: ["title", "detail", "sources"],
      },
    },
    providers: {
      type: "array",
      description: "Every medical provider that treated the client.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          specialty: { type: "string" },
          status: { type: "string", enum: ["treating", "gap", "finished", "unknown"] },
          last_visit: { type: ["string", "null"], description: "YYYY-MM-DD" },
          visit_note: { type: "string", description: "e.g. 'monthly follow-ups', '8 of last 10 visits'. Empty if unknown." },
          billed: { type: ["number", "null"] },
          payer: { type: "string", enum: ["lien", "health_insurance", "paid", "unknown"] },
          note: { type: "string", description: "e.g. 'final bill pending', 'records received'." },
          sources: SRC,
        },
        required: ["name", "specialty", "status", "last_visit", "visit_note", "billed", "payer", "note", "sources"],
      },
    },
    top_entry_ids: { type: "array", items: { type: "string" }, description: "The 10 entries that matter most, most important first." },
  },
  required: [
    "case_name", "case_type", "client_name", "date_of_loss", "date_of_loss_sources", "stage", "last_client_contact",
    "fault", "injuries", "insurance", "checks_note", "diagnoses", "value", "coverage", "medical_bills", "pitch",
    "waiting", "providers", "top_entry_ids",
  ],
};

const SYSTEM = `You brief a personal-injury trial attorney on a case in 60 seconds, using ONLY the case-file entries provided.
Rules:
- Every claim must cite the entry ids it comes from (exact ids as given). Include document page numbers when the entry text gives them (p.N).
- Never invent facts, names, amounts or dates. If the file does not say, use null / "unknown" verdicts and say "Not found in the case file".
- Plain, specific English. Short.
Checks (the attorney's test for a viable case):
- fault: someone else caused the incident. met = another party clearly at fault (citation, admission, police report); warning = disputed or shared fault; failed = client at fault; unknown = no evidence.
- injuries: the client is injured. met = diagnosed injuries documented in medical records; warning = complaints without objective findings; unknown = nothing found.
- insurance: there is money to recover. met = coverage confirmed and adequate; warning = confirmed but the case may exceed the limits, or only partly confirmed (say what to check, e.g. client's UIM); failed = no coverage or denied; unknown.
Case value: only from a valuation that exists in the file (custom field, memo, note). Otherwise low/high null and note "No valuation in the file".
Providers: status relative to today: treating = visits in the last 45 days or ongoing plan; gap = treatment stopped without discharge; finished = discharged or one-time visit.`;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOC_SHORT: Record<string, string> = {
  medical_record: "MED REC", imaging_report: "IMAGING", bill: "BILL", police_report: "POLICE RPT",
  insurance_correspondence: "INS LETTER", correspondence: "LETTER", legal_filing: "FILING", intake: "INTAKE", photo: "PHOTO", other: "DOC",
};
const KIND_SHORT: Record<Entry["kind"], string> = {
  note: "NOTE", email: "EMAIL", task: "TASK", calendar: "CAL", document: "DOC", expense: "EXPENSE", time: "TIME", contact: "CONTACT",
};

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m) return "";
  return y === new Date().getFullYear() ? `${MONTHS[m - 1]} ${String(d).padStart(2, "0")}` : `${MONTHS[m - 1]} ${y}`;
}

function daysBetween(a: string, b: Date): number {
  return Math.floor((b.getTime() - Date.parse(a)) / 86_400_000);
}

function addYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function monthsBetween(fromIso: string, to: Date): number {
  const f = new Date(`${fromIso}T00:00:00Z`);
  return (to.getUTCFullYear() - f.getUTCFullYear()) * 12 + (to.getUTCMonth() - f.getUTCMonth()) - (to.getUTCDate() < f.getUTCDate() ? 1 : 0);
}

export function synthesizeInput(bundle: MatterBundle, entries: Entry[], triage: Record<string, Triage>): string {
  const ranked = [...entries].sort((a, b) => (triage[b.id]?.importance ?? 0) - (triage[a.id]?.importance ?? 0));
  const picked = new Set<string>();
  const lines: string[] = [];
  for (const e of ranked) {
    const important = (triage[e.id]?.importance ?? 0) >= 0.35;
    if (picked.size >= 90 && !(e.kind === "document" && important)) continue;
    if (picked.size >= 140) break;
    picked.add(e.id);
    const max = e.kind === "document" ? 1800 : 700;
    lines.push(
      `### ${e.id} · ${e.kind} · ${e.date ?? "undated"} · importance ${(triage[e.id]?.importance ?? 0).toFixed(2)} · ${triage[e.id]?.category ?? ""}\n${e.title}\n${e.text.slice(0, max)}`,
    );
  }
  const m = bundle.matter as Record<string, unknown>;
  const cfs = customFields(bundle).map((c) => `- ${c.name}: ${c.value}`).join("\n");
  const client = bundle.client ? JSON.stringify(bundle.client).slice(0, 800) : "unknown";
  return [
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    `Matter: ${m.display_number} · ${m.description} · status ${m.status} · opened ${m.open_date ?? ""}`,
    `Client record: ${client}`,
    cfs ? `Matter custom fields (entered by the firm; cite as matter fields are not entries, so cite the entries that agree when possible):\n${cfs}` : "",
    `Case-file entries (${picked.size} of ${entries.length}, most important first):`,
    lines.join("\n\n"),
  ].filter(Boolean).join("\n\n");
}

export async function synthesize(
  bundle: MatterBundle,
  entries: Entry[],
  triage: Record<string, Triage>,
  docs: Record<string, DocExtraction>,
  usage: Usage,
): Promise<Digest> {
  const raw = await callStructured<Raw>({
    model: MODEL_DIGEST,
    system: SYSTEM,
    content: [{ type: "text", text: synthesizeInput(bundle, entries, triage) }],
    toolName: "write_case_brief",
    toolDescription: "Write the structured case brief.",
    schema: SCHEMA,
    maxTokens: 8000,
    usage,
  });

  const byId = new Map(entries.map((e) => [e.id, e]));
  const refs = (sources: Src[] | undefined): SourceRef[] => {
    const seen = new Set<string>();
    const out: SourceRef[] = [];
    for (const s of sources ?? []) {
      const e = byId.get(s.id);
      if (!e || seen.has(`${s.id}#${s.page}`)) continue; // drop citations to entries that don't exist
      seen.add(`${s.id}#${s.page}`);
      const kind = e.kind === "document" ? DOC_SHORT[docs[e.id]?.docType ?? "other"] ?? "DOC" : KIND_SHORT[e.kind];
      const when = s.page ? `P.${s.page}` : shortDate(e.date);
      out.push({ entryId: e.id, label: when ? `${kind} · ${when}` : kind, page: s.page ?? null });
    }
    return out.slice(0, 4);
  };
  const check = (c: CheckRaw): Check => ({
    verdict: c.verdict,
    verdictLabel: c.verdict_label,
    headline: c.headline,
    detail: c.detail,
    sources: refs(c.sources),
  });

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // Statute of limitations: computed, never generated. A limitations task or calendar
  // entry in Clio wins (the firm's own date); otherwise date of loss + SOL_YEARS.
  const dol = dateOnly(raw.date_of_loss);
  const limTask = bundle.tasks.find((t) => /limitation|statute/i.test(String(t.name ?? "")) && dateOnly(t.due_at));
  const limCal = bundle.calendar_entries.find((c) => /limitation|statute/i.test(String(c.summary ?? "")) && dateOnly(c.start_at));
  const firmDeadline = limTask ? dateOnly(limTask.due_at) : limCal ? dateOnly(limCal.start_at) : null;
  const limSources: Src[] = [
    ...(limTask ? [{ id: `task:${Number(limTask.id)}`, page: null }] : []),
    ...(limCal ? [{ id: `calendar:${Number(limCal.id)}`, page: null }] : []),
  ];
  const limRule = limTask ? String(limTask.description ?? "").split(/(?<=\.)\s/)[0]?.slice(0, 140) : "";
  let statute: StatuteCheck;
  if (dol || firmDeadline) {
    const deadline = firmDeadline ?? addYears(dol!, SOL_YEARS);
    const monthsLeft = monthsBetween(todayIso, new Date(`${deadline}T00:00:00Z`));
    const start = dol ?? addYears(deadline, -SOL_YEARS);
    const totalDays = Math.max(1, daysBetween(start, new Date(`${deadline}T00:00:00Z`)));
    const elapsedPct = Math.min(100, Math.max(0, Math.round((daysBetween(start, today) / totalDays) * 100)));
    const satisfied =
      raw.stage.current === "litigation" ||
      raw.stage.current === "resolved" ||
      String(limTask?.status ?? "").toLowerCase() === "complete";
    const passed = deadline < todayIso;
    const verdict: Verdict = satisfied ? "met" : passed ? "failed" : monthsLeft < 6 ? "warning" : "met";
    statute = {
      verdict,
      verdictLabel: satisfied ? (raw.stage.current === "resolved" ? "Resolved" : "Suit filed") : passed ? "Passed" : monthsLeft < 6 ? "File soon" : "On track",
      headline: satisfied
        ? "Suit filed in time"
        : passed
          ? "Deadline has passed"
          : monthsLeft < 1
            ? "Under a month left"
            : `${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left`,
      detail: satisfied ? `Limitations date was ${deadline}` : `File by ${deadline}`,
      sources: refs([...limSources, ...(raw.date_of_loss_sources ?? [])]),
      dateOfLoss: dol,
      deadline,
      monthsLeft: Math.max(0, monthsLeft),
      elapsedPct,
      rule: limRule || SOL_RULE_LABEL,
    };
  } else {
    statute = {
      verdict: "unknown", verdictLabel: "No date", headline: "Date of loss not found", detail: "Add the date of loss in Clio.",
      sources: [], dateOfLoss: null, deadline: null, monthsLeft: null, elapsedPct: null, rule: SOL_RULE_LABEL,
    };
  }

  // Overdue and upcoming: straight from Clio tasks and calendar, not the model.
  const overdue: AttentionItem[] = [];
  const upcoming: AttentionItem[] = [];
  for (const t of bundle.tasks) {
    const status = String(t.status ?? "").toLowerCase();
    const due = dateOnly(t.due_at);
    if (!due || status === "complete" || t.completed_at) continue;
    const id = `task:${Number(t.id)}`;
    const who = (t.assignee as { name?: string } | undefined)?.name;
    const days = daysBetween(due, today);
    if (due < todayIso) {
      overdue.push({ title: String(t.name ?? "Task"), detail: [who, `was due ${due}`, `${days} day${days === 1 ? "" : "s"} late`].filter(Boolean).join(" · "), due, sources: refs([{ id, page: null }]) });
    } else if (-days <= 30) {
      upcoming.push({ title: String(t.name ?? "Task"), detail: [who, due].filter(Boolean).join(" · "), due, sources: refs([{ id, page: null }]) });
    }
  }
  for (const c of bundle.calendar_entries) {
    const start = dateOnly(c.start_at);
    if (!start || start < todayIso || daysBetween(todayIso, new Date(`${start}T00:00:00Z`)) > 30) continue;
    upcoming.push({ title: String(c.summary ?? "Calendar entry"), detail: start, due: start, sources: refs([{ id: `calendar:${Number(c.id)}`, page: null }]) });
  }
  overdue.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  upcoming.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));

  // Firm spend: summed from Clio expense entries.
  const spend = expenseTotal(bundle);
  const expenseIds = entries.filter((e) => e.kind === "expense").map((e) => ({ id: e.id, page: null }));

  const order: Record<TreatmentStatus, number> = { treating: 0, gap: 1, finished: 2, unknown: 3 };
  const providers: Provider[] = raw.providers
    .map((p) => ({
      name: p.name, specialty: p.specialty, status: p.status, lastVisit: dateOnly(p.last_visit), visitNote: p.visit_note,
      billed: p.billed, payer: p.payer, note: p.note, sources: refs(p.sources),
    }))
    .sort((a, b) => order[a.status] - order[b.status] || (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));

  const diagnoses: Diagnosis[] = raw.diagnoses.map((d) => ({
    name: d.name, bodyRegion: d.body_region, detail: d.detail, primary: d.primary, sources: refs(d.sources),
  }));

  const checks = { fault: check(raw.fault), injuries: check(raw.injuries), insurance: check(raw.insurance), statute };
  const met = Object.values(checks).filter((c) => c.verdict === "met").length;

  const topIds = raw.top_entry_ids.filter((id) => byId.has(id));
  for (const e of [...entries].sort((a, b) => (triage[b.id]?.importance ?? 0) - (triage[a.id]?.importance ?? 0))) {
    if (topIds.length >= 10) break;
    if (!topIds.includes(e.id) && e.kind !== "contact") topIds.push(e.id);
  }

  const lcDate = dateOnly(raw.last_client_contact.date);
  const clientName = raw.client_name ?? ((bundle.matter.client as { name?: string } | undefined)?.name ?? null);
  const initials = (clientName ?? raw.case_name ?? "?").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const matterId = Number(bundle.matter.id);

  return {
    matter: {
      id: matterId,
      displayNumber: String(bundle.matter.display_number ?? ""),
      name: raw.case_name || String(bundle.matter.display_number ?? "Case"),
      description: String(bundle.matter.description ?? ""),
      caseType: raw.case_type,
      dateOfLoss: dol,
      caseAgeMonths: dol ? monthsBetween(dol, today) : null,
      clientName,
      clientInitials: initials || "?",
      clioUrl: matterUrl(matterId),
    },
    generatedAt: new Date().toISOString(),
    stage: { current: raw.stage.current, headline: raw.stage.headline, detail: raw.stage.detail, sources: refs(raw.stage.sources) },
    lastClientContact: {
      date: lcDate,
      daysAgo: lcDate ? Math.max(0, daysBetween(lcDate, today)) : null,
      how: raw.last_client_contact.how,
      sources: refs(raw.last_client_contact.sources),
    },
    checks,
    checksSummary: { met, total: 4, note: raw.checks_note },
    diagnoses,
    money: {
      value: { low: raw.value.low, high: raw.value.high, note: raw.value.note, sources: refs(raw.value.sources) },
      coverage: { amount: raw.coverage.amount, note: raw.coverage.note, sources: refs(raw.coverage.sources) },
      medicalBills: { amount: raw.medical_bills.amount, note: raw.medical_bills.note, sources: refs(raw.medical_bills.sources) },
      firmSpend: {
        amount: Math.round(spend * 100) / 100,
        note: expenseIds.length ? `${expenseIds.length} expense entr${expenseIds.length === 1 ? "y" : "ies"} in Clio` : "No expenses recorded in Clio",
        sources: refs(expenseIds.slice(0, 3)),
      },
    },
    pitch: raw.pitch.map((p) => ({ text: p.text, sources: refs(p.sources) })),
    attention: {
      overdue: overdue.slice(0, 5),
      upcoming: upcoming.slice(0, 5),
      waiting: raw.waiting.slice(0, 5).map((w) => ({ title: w.title, detail: w.detail, due: null, sources: refs(w.sources) })),
    },
    providers,
    topEntryIds: topIds.slice(0, 10),
    entries: Object.fromEntries(entries.map((e) => [e.id, { ...e, text: e.text.slice(0, 2500) }])),
    triage,
    usage: { ...usage, model: `${MODEL_DIGEST} + ${MODEL_TRIAGE}` },
  };
}
