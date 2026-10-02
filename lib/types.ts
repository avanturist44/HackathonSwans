/**
 * The contract between the digest pipeline (lib/) and the UI (app/, components/).
 * Everything the screens show comes from a Digest built from live Clio data.
 */

export type EntryKind =
  | "note"
  | "email"
  | "task"
  | "calendar"
  | "document"
  | "expense"
  | "time"
  | "contact";

/** One record from the Clio case file, normalized. */
export interface Entry {
  /** `${kind}:${clioId}`, unique across the case. */
  id: string;
  kind: EntryKind;
  clioId: number;
  /** ISO date (YYYY-MM-DD) the thing happened, if known. */
  date: string | null;
  /** ISO timestamp of the last change in Clio. */
  updatedAt: string | null;
  title: string;
  /** Body text, truncated for display. */
  text: string;
  author?: string | null;
  /** Where "open the original" goes: our read-only document proxy or the matter in Clio. */
  url: string;
}

/** A citation the UI renders as a source chip. Clicking opens the entry. */
export interface SourceRef {
  entryId: string;
  /** Short chip text, e.g. "EMAIL · SEP 20" or "MRI · P.14". */
  label: string;
  page?: number | null;
}

export type Category =
  | "liability"
  | "medical"
  | "treatment"
  | "bills"
  | "coverage"
  | "negotiation"
  | "client_contact"
  | "deadline"
  | "admin"
  | "other";

/** Per-entry triage: computed once per entry version and cached. */
export interface Triage {
  entryId: string;
  category: Category;
  /** 0..1 how much this entry matters for getting an attorney up to speed. */
  importance: number;
  /** 0..1 probability it is safe to share with a treating provider. */
  shareable: number;
  /** True when the entry marks a change in where the case stands. */
  statusChange: boolean;
  /** One short phrase on why (shown in share review). */
  reason: string;
}

export type Stage =
  | "intake"
  | "treating"
  | "records"
  | "demand"
  | "negotiation"
  | "litigation"
  | "resolved";

export const STAGES: { id: Stage; label: string; providerLabel: string }[] = [
  { id: "intake", label: "Intake", providerLabel: "Intake" },
  { id: "treating", label: "Treating", providerLabel: "Treatment" },
  { id: "records", label: "Records & bills", providerLabel: "Collecting records" },
  { id: "demand", label: "Demand", providerLabel: "Demand sent" },
  { id: "negotiation", label: "Negotiation", providerLabel: "Negotiating" },
  { id: "litigation", label: "Litigation", providerLabel: "In litigation" },
  { id: "resolved", label: "Resolved", providerLabel: "Settled · bills paid" },
];

/** met = green, warning = amber, failed = red, unknown = grey. */
export type Verdict = "met" | "warning" | "failed" | "unknown";

export interface Check {
  verdict: Verdict;
  /** Pill text, e.g. "Clear", "Documented", "Check UIM", "On track". */
  verdictLabel: string;
  /** Big line, e.g. "Other driver, cited at the scene". */
  headline: string;
  /** One or two sentences. */
  detail: string;
  sources: SourceRef[];
}

export interface StatuteCheck extends Check {
  dateOfLoss: string | null;
  deadline: string | null;
  monthsLeft: number | null;
  /** 0..100 share of the limitation period already used. */
  elapsedPct: number | null;
  /** e.g. "2-year personal-injury deadline, counted from the crash". */
  rule: string;
}

export type BodyRegion =
  | "head"
  | "neck"
  | "left_shoulder"
  | "right_shoulder"
  | "upper_back"
  | "lower_back"
  | "chest"
  | "abdomen"
  | "left_arm"
  | "right_arm"
  | "left_hand"
  | "right_hand"
  | "hip"
  | "left_knee"
  | "right_knee"
  | "left_leg"
  | "right_leg"
  | "other";

export interface Diagnosis {
  name: string;
  bodyRegion: BodyRegion;
  /** e.g. "Lower back · confirmed on MRI · primary injury". */
  detail: string;
  primary: boolean;
  sources: SourceRef[];
}

export type TreatmentStatus = "treating" | "gap" | "finished" | "unknown";
export type Payer = "lien" | "health_insurance" | "paid" | "unknown";

export interface Provider {
  name: string;
  specialty: string;
  status: TreatmentStatus;
  lastVisit: string | null;
  /** e.g. "monthly follow-ups", "8 of last 10 visits". */
  visitNote: string;
  billed: number | null;
  payer: Payer;
  /** e.g. "final bill pending", "records received". */
  note: string;
  sources: SourceRef[];
}

export interface AttentionItem {
  title: string;
  detail: string;
  due: string | null;
  sources: SourceRef[];
}

export interface MoneyFigure {
  amount: number | null;
  note: string;
  sources: SourceRef[];
}

export interface Digest {
  matter: {
    id: number;
    displayNumber: string;
    /** Short case name for the header, e.g. "Sapini". */
    name: string;
    description: string;
    /** e.g. "Personal injury · Rear-end collision". */
    caseType: string;
    dateOfLoss: string | null;
    caseAgeMonths: number | null;
    clientName: string | null;
    clientInitials: string;
    clioUrl: string;
  };
  generatedAt: string;
  stage: {
    current: Stage;
    /** e.g. "The demand is with the insurer." */
    headline: string;
    /** e.g. "Sent Sep 20 at the $100K policy limit · response due Oct 20". */
    detail: string;
    sources: SourceRef[];
  };
  lastClientContact: {
    date: string | null;
    daysAgo: number | null;
    /** e.g. "Phone call". */
    how: string;
    sources: SourceRef[];
  };
  checks: {
    fault: Check;
    injuries: Check;
    insurance: Check;
    statute: StatuteCheck;
  };
  /** e.g. { met: 3, total: 4, note: "the policy limit may cap recovery" } */
  checksSummary: { met: number; total: number; note: string };
  diagnoses: Diagnosis[];
  money: {
    value: { low: number | null; high: number | null; note: string; sources: SourceRef[] };
    coverage: MoneyFigure;
    medicalBills: MoneyFigure;
    firmSpend: MoneyFigure;
  };
  /** The 60-second pitch, one sentence per item, each with its sources. */
  pitch: { text: string; sources: SourceRef[] }[];
  attention: {
    overdue: AttentionItem[];
    upcoming: AttentionItem[];
    waiting: AttentionItem[];
  };
  /** Sorted by treatment status: treating, gap, finished, unknown. */
  providers: Provider[];
  /** Entry ids, most important first (the "10 that matter"). */
  topEntryIds: string[];
  /** Every entry in the case, keyed by id (text truncated). */
  entries: Record<string, Entry>;
  triage: Record<string, Triage>;
  usage: { inputTokens: number; outputTokens: number; costUsd: number; model: string };
}

/** Attorney decisions about what one provider may see. */
export interface ShareState {
  /** Provider name exactly as in Digest.providers[].name. */
  provider: string;
  /** entryId -> explicit decision; absent = follow the triage model. */
  decisions: Record<string, "share" | "withhold">;
  /** Show "coverage: yes/no" to the provider (never the amount). */
  showCoverage: boolean;
  token: string | null;
  sharedAt: string | null;
  opens: { at: string; userAgent: string }[];
}

/** Thresholds the share review uses on Triage.shareable. */
export const SHARE_AUTO = 0.85;
export const WITHHOLD_AUTO = 0.25;
