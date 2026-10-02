/** Display formatting shared by every screen. Pure functions, safe on server and client. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse "YYYY-MM-DD" as a calendar date (no timezone shift) or a full ISO timestamp. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

/** "Sep 20" this year, "Jul 14, 2025" otherwise. "—" when missing. */
export function shortDate(value: string | null | undefined, now: Date = new Date()): string {
  const d = parseDate(value);
  if (!d) return "—";
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** Always "Jul 14, 2025". */
export function longDate(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Compact money: $31.4K, $120K, $1.2M, $850. "—" when null. */
export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trim(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

function trim(x: number): string {
  const r = x >= 100 ? Math.round(x) : Math.round(x * 10) / 10;
  return String(r).replace(/\.0$/, "");
}

/** Full money: $12,800. "—" when null. */
export function moneyFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

/** "$85K–$120K", a single figure when only one end is known, "—" when neither. */
export function moneyRange(low: number | null, high: number | null): string {
  if (low == null && high == null) return "—";
  if (low == null) return `Up to ${money(high)}`;
  if (high == null || high === low) return money(low);
  return `${money(low)}–${money(high)}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "6 days ago", or a date. */
export function relativeTime(value: string | null | undefined, now: Date = new Date()): string {
  const d = parseDate(value);
  if (!d) return "—";
  const sec = Math.round((now.getTime() - d.getTime()) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return shortDate(value, now);
}

export function daysAgoText(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function pct(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

export const KIND_LABEL: Record<string, string> = {
  email: "EMAIL",
  document: "DOC",
  note: "NOTE",
  task: "TASK",
  calendar: "CALENDAR",
  expense: "EXPENSE",
  time: "TIME",
  contact: "CONTACT",
};

export const CATEGORY_LABEL: Record<string, string> = {
  liability: "Liability",
  medical: "Medical",
  treatment: "Treatment",
  bills: "Bills",
  coverage: "Coverage",
  negotiation: "Negotiation",
  client_contact: "Client contact",
  deadline: "Deadline",
  admin: "Admin",
  other: "Other",
};

export const PAYER_LABEL: Record<string, string> = {
  lien: "Lien",
  health_insurance: "Health insurance",
  paid: "Paid",
  unknown: "Unknown",
};

export const STATUS_LABEL: Record<string, string> = {
  treating: "Treating",
  gap: "Gap",
  finished: "Finished",
  unknown: "Unknown",
};

export const STATUS_PILL: Record<string, string> = {
  treating: "pill-blue",
  gap: "pill-amber",
  finished: "pill-grey",
  unknown: "pill-grey",
};

export const VERDICT_PILL: Record<string, string> = {
  met: "pill-green",
  warning: "pill-amber",
  failed: "pill-red",
  unknown: "pill-grey",
};

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0] ?? "?").toUpperCase();
}

/** Signed whole days from now until an ISO date (negative = past). */
export function daysUntil(value: string | null | undefined, now: Date = new Date()): number | null {
  const d = parseDate(value);
  if (!d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}
