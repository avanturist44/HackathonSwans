import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AttentionItem, Check, Digest, Entry, StatuteCheck } from "@/lib/types";
import { isConnected, loadDigest } from "@/lib/data";
import { BodyMap } from "@/components/BodyMap";
import { DigestRunner } from "@/components/DigestRunner";
import { EntryList, type EntryRow } from "@/components/EntryList";
import { LastOpenedMarker } from "@/components/LastOpenedMarker";
import { EntryTitleButton, SourceChips, SourcesProvider } from "@/components/Sources";
import { StageBar } from "@/components/StageBar";
import { TopBar } from "@/components/TopBar";
import { TreatmentTable } from "@/components/TreatmentTable";
import { VerdictIcon } from "@/components/icons";
import {
  CATEGORY_LABEL,
  KIND_LABEL,
  VERDICT_PILL,
  daysAgoText,
  daysUntil,
  initials,
  longDate,
  money,
  moneyRange,
  parseDate,
  plural,
  relativeTime,
  shortDate,
} from "@/components/format";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function MatterPage() {
  const digest = await loadDigest();

  if (!digest) {
    if (!(await isConnected())) redirect("/");
    return (
      <>
        <TopBar active="brief" />
        <main className="page">
          <section className="card card-lg" style={{ gap: 14, maxWidth: 640 }}>
            <div className="label">No brief yet</div>
            <h1 className="h1" style={{ fontSize: 26 }}>
              Build the case brief
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              CaseBrief will read every note, email, task, document and bill on the matter in Clio, triage each one, and
              write the brief. It reads only; nothing in Clio changes.
            </p>
            <DigestRunner />
          </section>
        </main>
      </>
    );
  }

  const jar = await cookies();
  const lastOpened = jar.get("cb_last_opened")?.value ?? null;

  return (
    <SourcesProvider entries={digest.entries ?? {}}>
      <TopBar
        active="brief"
        right={
          <>
            <span>Updated {relativeTime(digest.generatedAt)}</span>
            <DigestRunner compact />
          </>
        }
      />
      <main className="page">
        <CaseHeader digest={digest} />
        <Checks digest={digest} />
        <MoneyRow digest={digest} />
        <div className="row">
          <section aria-labelledby="story-h" className="card card-lg" style={{ flex: "1.45 1 440px", gap: 22 }}>
            <Pitch digest={digest} />
            <SinceLastOpened digest={digest} lastOpened={lastOpened} />
          </section>
          <Attention digest={digest} />
        </div>
        <TreatmentTable providers={digest.providers ?? []} />
        <Entries digest={digest} />
      </main>
      <LastOpenedMarker />
    </SourcesProvider>
  );
}

/* ---------------- Case header & stage ---------------- */

function CaseHeader({ digest }: { digest: Digest }) {
  const { matter, stage, lastClientContact: contact } = digest;
  const sub = [
    matter.caseType,
    matter.dateOfLoss ? `Date of loss ${longDate(matter.dateOfLoss)}` : null,
    matter.caseAgeMonths != null ? `Case age ${plural(matter.caseAgeMonths, "month")}` : null,
  ].filter(Boolean);
  const days = contact?.daysAgo ?? null;
  const tone = days == null ? "muted-2" : days >= 30 ? "tone-bad" : days >= 14 ? "tone-warn" : "tone-ok";

  return (
    <section aria-label="Where the case stands" className="card card-lg" style={{ gap: 26 }}>
      <div className="case-head">
        <div className="avatar" aria-hidden="true">
          {matter.clientInitials || initials(matter.clientName ?? matter.name)}
        </div>
        <div style={{ flexGrow: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className="h1">{matter.name || "Untitled matter"}</h1>
            {matter.displayNumber &&
              (matter.clioUrl ? (
                <a
                  href={matter.clioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tag-mono pill-grey"
                  style={{ textDecoration: "none" }}
                  title="Open the matter in Clio"
                >
                  {matter.displayNumber}
                </a>
              ) : (
                <span className="tag-mono pill-grey">{matter.displayNumber}</span>
              ))}
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {sub.length ? sub.join(" · ") : "—"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 36, flexWrap: "wrap" }}>
          <div>
            <div className="label">Last client contact</div>
            <div className={`contact-days ${tone}`}>{days == null ? "Not found" : daysAgoText(days)}</div>
            <div className="small muted-2" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
              {contact?.how || (contact?.date ? shortDate(contact.date) : "No contact logged")}
              <SourceChips sources={contact?.sources} max={2} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <StageBar current={stage.current} audience="attorney" />
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          {stage.headline && <span style={{ fontSize: 17, fontWeight: 600 }}>{stage.headline}</span>}
          {stage.detail && <span className="muted">{stage.detail}</span>}
          <SourceChips sources={stage.sources} max={3} />
        </div>
      </div>
    </section>
  );
}

/* ---------------- Does the case hold up? ---------------- */

function VerdictPill({ check }: { check: Check }) {
  return (
    <span className={`pill ${VERDICT_PILL[check.verdict] ?? "pill-grey"}`}>
      <VerdictIcon verdict={check.verdict} />
      {check.verdictLabel || "Unknown"}
    </span>
  );
}

function CheckCard({ label, check }: { label: string; check: Check | null | undefined }) {
  return (
    <div className="card" style={{ flex: "1 1 230px" }}>
      <div className="card-head">
        <span className="label">{label}</span>
        {check && <VerdictPill check={check} />}
      </div>
      {check ? (
        <>
          <div className="headline">{check.headline || "—"}</div>
          {check.detail && <div className="detail">{check.detail}</div>}
          <div className="card-foot">
            <SourceChips sources={check.sources} max={3} />
          </div>
        </>
      ) : (
        <div className="empty">Not found in the case file</div>
      )}
    </div>
  );
}

function StatuteCard({ check }: { check: StatuteCheck | null | undefined }) {
  if (!check) return <CheckCard label="Statute of limitations" check={null} />;
  const elapsed = check.elapsedPct == null ? null : Math.max(0, Math.min(100, check.elapsedPct));
  const meterTone = check.verdict === "failed" ? "meter-red" : check.verdict === "warning" ? "meter-amber" : "";
  return (
    <div className="card" style={{ flex: "1 1 230px" }}>
      <div className="card-head">
        <span className="label">Statute of limitations</span>
        <VerdictPill check={check} />
      </div>
      <div className="headline">{check.headline || "—"}</div>
      {elapsed != null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            className={`meter ${meterTone}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(elapsed)}
            aria-label="Share of the limitation period already used"
          >
            <div style={{ width: `${elapsed}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--muted-2)" }}>
            <span>Date of loss {longDate(check.dateOfLoss)}</span>
            <span>File by {longDate(check.deadline)}</span>
          </div>
        </div>
      )}
      {elapsed == null && (check.dateOfLoss || check.deadline) && (
        <div className="small muted-2">
          Date of loss {longDate(check.dateOfLoss)} · File by {longDate(check.deadline)}
        </div>
      )}
      {check.rule && <div className="detail">{check.rule}</div>}
      {check.detail && check.detail !== check.rule && <div className="detail">{check.detail}</div>}
      <div className="card-foot">
        <SourceChips sources={check.sources} max={3} />
      </div>
    </div>
  );
}

function Checks({ digest }: { digest: Digest }) {
  const { checks, checksSummary: sum } = digest;
  const injuries = checks?.injuries;
  const diagnoses = [...(digest.diagnoses ?? [])].sort((a, b) => Number(b.primary) - Number(a.primary));

  return (
    <section aria-labelledby="pillars-h" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="section-head">
        <h2 id="pillars-h" className="h2">
          Does the case hold up?
        </h2>
        {sum && (
          <span className="muted" style={{ fontSize: 14 }}>
            <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
              {sum.met} of {sum.total} checks met
            </strong>
            {sum.note ? ` · ${sum.note}` : ""}
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 16 }}>
        <CheckCard label="Who caused it" check={checks?.fault} />

        <div className="card" style={{ flex: "1.7 1 360px", flexDirection: "row", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          <BodyMap diagnoses={diagnoses} />
          <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card-head">
              <span className="label">Injuries &amp; diagnoses</span>
              {injuries && <VerdictPill check={injuries} />}
            </div>
            {diagnoses.length > 0 ? (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {diagnoses.map((d, i) => (
                  <li key={`${d.name}-${i}`}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={d.primary ? { fontSize: 17, fontWeight: 700 } : { fontSize: 15, fontWeight: 600 }}>
                        {d.name}
                      </span>
                      <SourceChips sources={d.sources} max={2} />
                    </div>
                    {d.detail && <div className="detail">{d.detail}</div>}
                  </li>
                ))}
              </ul>
            ) : injuries?.headline ? (
              <>
                <div className="headline">{injuries.headline}</div>
                {injuries.detail && <div className="detail">{injuries.detail}</div>}
                <SourceChips sources={injuries.sources} max={3} />
              </>
            ) : (
              <div className="empty">Not found in the case file</div>
            )}
          </div>
        </div>

        <CheckCard label="Insurance & money" check={checks?.insurance} />
        <StatuteCard check={checks?.statute} />
      </div>
    </section>
  );
}

/* ---------------- Money ---------------- */

function MoneyRow({ digest }: { digest: Digest }) {
  const m = digest.money;
  const providerCount = digest.providers?.length ?? 0;
  return (
    <section aria-label="Money" className="tiles">
      <div className="card" style={{ gap: 6 }}>
        <div className="label">Case value (estimate)</div>
        <div className="figure">{moneyRange(m?.value?.low ?? null, m?.value?.high ?? null)}</div>
        {m?.value?.note && <div className="detail">{m.value.note}</div>}
        <div style={{ marginTop: 4 }}>
          <SourceChips sources={m?.value?.sources} max={3} />
        </div>
      </div>
      <div className="card" style={{ gap: 6 }}>
        <div className="label">Medical bills to date</div>
        <div className="figure">{money(m?.medicalBills?.amount)}</div>
        {m?.medicalBills?.note && <div className="detail">{m.medicalBills.note}</div>}
        <div className="chips" style={{ marginTop: 4 }}>
          {providerCount > 0 && (
            <a href="#treatment" className="chip">
              {plural(providerCount, "PROVIDER", "PROVIDERS")}
            </a>
          )}
          <SourceChips sources={m?.medicalBills?.sources} max={2} />
        </div>
      </div>
      <div className="card" style={{ gap: 6 }}>
        <div className="label">Firm has spent</div>
        <div className="figure">{money(m?.firmSpend?.amount)}</div>
        {m?.firmSpend?.note && <div className="detail">{m.firmSpend.note}</div>}
        <div style={{ marginTop: 4 }}>
          <SourceChips sources={m?.firmSpend?.sources} max={3} />
        </div>
      </div>
    </section>
  );
}

/* ---------------- Pitch & recent changes ---------------- */

function Pitch({ digest }: { digest: Digest }) {
  const pitch = digest.pitch ?? [];
  return (
    <div>
      <h2 id="story-h" className="h2" style={{ marginBottom: 10 }}>
        The pitch <span className="sub">· 60 seconds</span>
      </h2>
      {pitch.length ? (
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: "var(--ink-2)" }}>
          {pitch.map((s, i) => (
            <span key={i}>
              {s.text} <SourceChips sources={s.sources} max={2} />{" "}
            </span>
          ))}
        </p>
      ) : (
        <p className="empty" style={{ margin: 0 }}>
          Not found in the case file.
        </p>
      )}
    </div>
  );
}

function updatedTime(e: Entry): number {
  const d = parseDate(e.updatedAt);
  return d ? d.getTime() : NaN;
}

function SinceLastOpened({ digest, lastOpened }: { digest: Digest; lastOpened: string | null }) {
  const entries = Object.values(digest.entries ?? {});
  const since = parseDate(lastOpened);
  let changed: Entry[];
  let title: string;
  let sub: string;

  if (since) {
    changed = entries.filter((e) => updatedTime(e) > since.getTime());
    const days = Math.max(0, Math.round((Date.now() - since.getTime()) / DAY));
    title = "Since you last opened";
    sub = `${plural(changed.length, "change")} in ${days === 0 ? "less than a day" : plural(days, "day")}`;
  } else {
    // First visit: there is no "last opened" yet, so show the latest things that happened in the case.
    const todayIso = new Date().toISOString().slice(0, 10);
    changed = entries
      .filter((e) => e.kind !== "contact" && e.date && e.date <= todayIso)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 5);
    title = "Recent activity";
    sub = "latest in the case file";
    return (
      <div className="divider">
        <h3 className="h3" style={{ marginBottom: 12 }}>
          {title} <span className="sub">· {sub}</span>
        </h3>
        {changed.length ? (
          <ul className="plain-list">
            {changed.map((e) => (
              <li key={e.id} className="change-row">
                <span className="tag-mono tag-new">{e.kind === "document" ? "DOC" : e.kind.toUpperCase().slice(0, 5)}</span>
                <span className="grow">
                  <EntryTitleButton entryId={e.id}>{e.title || "Untitled entry"}</EntryTitleButton>
                </span>
                <span className="date-col">{shortDate(e.date)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty" style={{ margin: 0 }}>
            Nothing found in the case file.
          </p>
        )}
      </div>
    );
  }
  changed.sort((a, b) => updatedTime(b) - updatedTime(a));
  const shown = changed.slice(0, 5);

  return (
    <div className="divider">
      <h3 className="h3" style={{ marginBottom: 12 }}>
        {title} <span className="sub">· {sub}</span>
      </h3>
      {shown.length ? (
        <ul className="plain-list">
          {shown.map((e) => (
            <li key={e.id} className="change-row">
              <span className="tag-mono tag-new">NEW</span>
              <span className="grow">
                <EntryTitleButton entryId={e.id}>{e.title || "Untitled entry"}</EntryTitleButton>
              </span>
              <span className="date-col">{shortDate(e.updatedAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty" style={{ margin: 0 }}>
          Nothing has changed in the case file.
        </p>
      )}
    </div>
  );
}

/* ---------------- Needs attention ---------------- */

type Group = "overdue" | "upcoming" | "waiting";

const GROUPS: { id: Group; title: string; dot: string; color: string; empty: string }[] = [
  { id: "overdue", title: "Overdue", dot: "var(--red)", color: "var(--red)", empty: "Nothing overdue" },
  { id: "upcoming", title: "Coming up", dot: "var(--amber)", color: "var(--amber-ink)", empty: "Nothing scheduled" },
  { id: "waiting", title: "Waiting on others", dot: "var(--grey-dot)", color: "var(--muted)", empty: "Not waiting on anyone" },
];

function dueText(group: Group, item: AttentionItem): string | null {
  if (!item.due) return null;
  const d = daysUntil(item.due);
  if (group === "overdue") {
    const late = d != null && d < 0 ? ` · ${plural(-d, "day")} late` : "";
    return `was due ${shortDate(item.due)}${late}`;
  }
  if (group === "upcoming") {
    const soon = d != null && d >= 0 && d <= 30 ? (d === 0 ? " · today" : ` · in ${plural(d, "day")}`) : "";
    return `${shortDate(item.due)}${soon}`;
  }
  return `due ${shortDate(item.due)}`;
}

function Attention({ digest }: { digest: Digest }) {
  const att = digest.attention ?? { overdue: [], upcoming: [], waiting: [] };
  return (
    <section aria-labelledby="attn-h" className="card card-lg" style={{ flex: "1 1 320px", gap: 20, padding: 24 }}>
      <h2 id="attn-h" className="h2">
        Needs attention
      </h2>
      {GROUPS.map((g) => {
        const items = att[g.id] ?? [];
        return (
          <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="group-head">
              <span className="dot" style={{ background: g.dot }} />
              <h3 className="group-title" style={{ color: g.color, margin: 0 }}>
                {g.title} · {items.length}
              </h3>
            </div>
            {items.length ? (
              items.map((it, i) => {
                const meta = [it.detail, dueText(g.id, it)].filter(Boolean).join(" · ");
                return (
                  <div key={`${it.title}-${i}`} className={`att-item att-${g.id}`}>
                    <div style={{ fontWeight: 600 }}>{it.title}</div>
                    {(meta || it.sources?.length > 0) && (
                      <div className="detail" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
                        {meta && <span>{meta}</span>}
                        <SourceChips sources={it.sources} max={2} />
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty" style={{ fontSize: 13 }}>
                {g.empty}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ---------------- Entries ---------------- */

function Entries({ digest }: { digest: Digest }) {
  const entries = digest.entries ?? {};
  const triage = digest.triage ?? {};
  const toRow = (e: Entry): EntryRow => {
    const cat = triage[e.id]?.category;
    return {
      id: e.id,
      date: e.date ? longDate(e.date) : e.updatedAt ? longDate(e.updatedAt) : "—",
      kind: KIND_LABEL[e.kind] ?? String(e.kind).toUpperCase(),
      title: e.title || "Untitled entry",
      category: cat ? (CATEGORY_LABEL[cat] ?? cat) : null,
    };
  };
  const top = (digest.topEntryIds ?? []).map((id) => entries[id]).filter((e): e is Entry => Boolean(e)).map(toRow);
  const sortKey = (e: Entry) => e.date ?? e.updatedAt?.slice(0, 10) ?? "";
  const all = Object.values(entries)
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .map(toRow);
  return <EntryList top={top} all={all} />;
}
