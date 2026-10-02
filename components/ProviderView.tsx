import type { ProviderView as View } from "@/lib/share";
import { PAYER_LABEL, daysAgoText, money, shortDate } from "./format";
import { LockIcon } from "./icons";
import { StageBar } from "./StageBar";
import { NotifyToggle } from "./NotifyToggle";

/** What a treating provider sees. Only fields from the server-built ProviderView; nothing else leaves. */
export function ProviderView({ view }: { view: View }) {
  const p = view.provider;
  const lienNote = p
    ? [p.payer !== "unknown" ? `Paid by: ${PAYER_LABEL[p.payer]}` : null, p.note].filter(Boolean).join(" · ")
    : "";
  const since = p?.lastVisit ? `Last visit ${shortDate(p.lastVisit)}` : null;
  const relation = p ? [p.specialty, p.status === "treating" ? "treating" : null, p.payer === "lien" ? "on a lien" : null] : [];

  return (
    <main className="page" style={{ paddingTop: 24 }}>
      <div className="banner">
        <LockIcon />
        <span>
          Shared securely by the client&apos;s law firm. You see case status, your own bills and records, and what the firm
          needs from you.
        </span>
      </div>

      <section aria-label="Is the case alive" className="card card-lg" style={{ gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div>
            <h1 className="h1" style={{ fontSize: 28 }}>
              Patient: {view.patientName || "—"}
            </h1>
            <div className="muted" style={{ marginTop: 4 }}>
              {[view.providerName, ...relation.filter(Boolean)].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div className={`status-block ${view.active ? "status-active" : "status-closed"}`}>
            <span className="dot" style={{ width: 12, height: 12, background: view.active ? "var(--green)" : "var(--muted)" }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: view.active ? "var(--green-ink)" : "var(--ink)" }}>
                {view.active ? "Case is active" : "Case closed"}
              </div>
              <div className="small" style={{ color: view.active ? "var(--green)" : "var(--muted)" }}>
                {view.lastMovement.daysAgo != null
                  ? `Last moved ${daysAgoText(view.lastMovement.daysAgo).toLowerCase()}`
                  : "No recent movement shared"}
              </div>
            </div>
          </div>
        </div>
        <StageBar current={view.stage} audience="provider" />
      </section>

      <section aria-label="Your three answers" className="tiles tiles-wide">
        {view.coverageConfirmed !== null && (
          <div className="card" style={{ gap: 6 }}>
            <div className="label">Coverage behind the case</div>
            <div className="figure">{view.coverageConfirmed ? "Yes" : "Not confirmed"}</div>
            <div className="detail">
              {view.coverageConfirmed
                ? "The firm has confirmed an insurance policy"
                : "The firm has not confirmed an insurance policy yet"}
            </div>
          </div>
        )}
        <div className="card" style={{ gap: 6 }}>
          <div className="label">Your balance on lien</div>
          <div className="figure">{money(p?.billed)}</div>
          <div className="detail">{p ? lienNote || since || "—" : "Not found in the case file"}</div>
        </div>
        <div className="card" style={{ gap: 6 }}>
          <div className="label">Patient still treating?</div>
          <div className="figure">{view.stillTreating.yes == null ? "—" : view.stillTreating.yes ? "Yes" : "No"}</div>
          <div className="detail">{view.stillTreating.detail || "—"}</div>
        </div>
      </section>

      <div className="row row-top">
        <section aria-labelledby="needs-h" className="card card-accent" style={{ flex: "1 1 340px", gap: 14, padding: "22px 24px" }}>
          <h2 id="needs-h" className="h2">
            What the firm needs from you
          </h2>
          {view.needs.length ? (
            view.needs.map((n, i) => (
              <div key={`${n.title}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontWeight: 600 }}>{n.title}</div>
                <div className="detail">{[n.detail, n.due ? `due ${shortDate(n.due)}` : null].filter(Boolean).join(" · ")}</div>
              </div>
            ))
          ) : (
            <p className="empty" style={{ margin: 0 }}>
              Nothing needed right now
            </p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary">
              Upload records
            </button>
            <button type="button" className="btn">
              Message the firm
            </button>
          </div>
        </section>

        <section aria-labelledby="updates-h" className="card" style={{ flex: "1.3 1 380px", gap: 4, padding: "22px 24px" }}>
          <h2 id="updates-h" className="h2" style={{ marginBottom: 8 }}>
            Case updates
          </h2>
          {view.updates.length ? (
            view.updates.map((u, i) => (
              <div key={`${u.date}-${i}`} className="update-row">
                <span className="date-col">{shortDate(u.date)}</span>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{u.text}</span>
              </div>
            ))
          ) : (
            <p className="empty" style={{ margin: "0 0 12px" }}>
              No updates shared yet.
            </p>
          )}
          <NotifyToggle />
        </section>
      </div>
    </main>
  );
}
