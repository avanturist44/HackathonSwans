"use client";

import { useMemo, useState } from "react";
import type { Provider } from "@/lib/types";
import { PAYER_LABEL, STATUS_LABEL, STATUS_PILL, moneyFull, shortDate } from "./format";
import { SourceChips } from "./Sources";

/** Treatment & bills table. Default order is the pipeline's (treating, gap, finished, unknown). */
export function TreatmentTable({ providers }: { providers: Provider[] }) {
  const [byAmount, setByAmount] = useState(false);
  const rows = useMemo(
    () => (byAmount ? [...providers].sort((a, b) => (b.billed ?? -1) - (a.billed ?? -1)) : providers),
    [providers, byAmount],
  );
  const treating = providers.filter((p) => p.status === "treating").length;
  const total = providers.reduce((s, p) => s + (p.billed ?? 0), 0);
  const onLien = providers.filter((p) => p.payer === "lien").reduce((s, p) => s + (p.billed ?? 0), 0);
  const anyBilled = providers.some((p) => p.billed != null);

  return (
    <section id="treatment" aria-labelledby="treat-h" className="card card-lg" style={{ gap: 0 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 6 }}
      >
        <h2 id="treat-h" className="h2">
          Treatment &amp; bills <span className="sub">· {treating} still treating</span>
        </h2>
        {providers.length > 1 && (
          <button type="button" className="btn btn-sm" style={{ fontWeight: 500 }} onClick={() => setByAmount((v) => !v)}>
            {byAmount ? "Sort: amount billed" : "Sort: treatment status"}
          </button>
        )}
      </div>
      {providers.length === 0 ? (
        <p className="empty" style={{ margin: "10px 4px 0" }}>
          No treating providers found in the case file.
        </p>
      ) : (
        <div role="table" aria-labelledby="treat-h">
          <div role="row" className="grid-row grid-head label">
            <span role="columnheader">Provider</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Last visit</span>
            <span role="columnheader" style={{ textAlign: "right" }}>
              Billed
            </span>
            <span role="columnheader">Paid by</span>
          </div>
          {rows.map((p, i) => (
            <div role="row" className="grid-row" key={`${p.name}-${i}`}>
              <div role="cell">
                <div style={{ fontWeight: 600, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
                  {p.name || "Unnamed provider"}
                  <SourceChips sources={p.sources} />
                </div>
                <div className="small muted-2">{[p.specialty, p.note].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div role="cell" className="c-status">
                <span className={`pill ${STATUS_PILL[p.status] ?? "pill-grey"}`}>{STATUS_LABEL[p.status] ?? "Unknown"}</span>
              </div>
              <div role="cell" className="c-visit" style={{ fontSize: 14, color: "var(--ink-2)" }}>
                {[p.lastVisit ? shortDate(p.lastVisit) : null, p.visitNote].filter(Boolean).join(" · ") || "—"}
              </div>
              <div role="cell" className="num c-num">
                {moneyFull(p.billed)}
              </div>
              <div role="cell" className="c-payer" style={{ fontSize: 14 }}>
                {PAYER_LABEL[p.payer] ?? "Unknown"}
              </div>
            </div>
          ))}
          <div role="row" className="grid-row grid-total">
            <div role="cell">Total · {providers.length} {providers.length === 1 ? "provider" : "providers"}</div>
            <div role="cell" className="c-status" />
            <div role="cell" className="c-visit" />
            <div role="cell" className="num c-num">
              {anyBilled ? moneyFull(total) : "—"}
            </div>
            <div role="cell" className="c-payer" style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>
              {moneyFull(onLien)} on lien
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
