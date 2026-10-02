"use client";

import { useState } from "react";
import { EntryTitleButton } from "./Sources";

export interface EntryRow {
  id: string;
  date: string;
  kind: string;
  title: string;
  category: string | null;
}

const PAGE = 25;

/** "The entries that matter" with a toggle to the full, paged timeline. */
export function EntryList({ top, all }: { top: EntryRow[]; all: EntryRow[] }) {
  const [full, setFull] = useState(top.length === 0 && all.length > 0);
  const [shown, setShown] = useState(PAGE);
  const rows = full ? all.slice(0, shown) : top;

  return (
    <section id="entries" aria-labelledby="entries-h" className="card card-lg" style={{ gap: 0 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 8 }}
      >
        <h2 id="entries-h" className="h2">
          {full ? "Full timeline" : `The ${top.length} ${top.length === 1 ? "entry" : "entries"} that matter`}{" "}
          <span className="sub">· of {all.length}</span>
        </h2>
        <div className="seg" role="group" aria-label="Which entries to show">
          <button type="button" aria-pressed={!full} onClick={() => setFull(false)}>
            Top {top.length}
          </button>
          <button
            type="button"
            aria-pressed={full}
            onClick={() => {
              setFull(true);
              setShown(PAGE);
            }}
          >
            Full timeline ({all.length})
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="empty" style={{ margin: "10px 4px 0" }}>
          Not found in the case file.
        </p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((r) => (
            <li key={r.id} className="entry-row">
              <span className="date-col">{r.date}</span>
              <span className="kind">{r.kind}</span>
              <span className="c-title" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <EntryTitleButton entryId={r.id}>{r.title}</EntryTitleButton>
              </span>
              <span className="c-cat">{r.category && <span className="tag">{r.category}</span>}</span>
            </li>
          ))}
        </ol>
      )}
      {full && shown < all.length && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({all.length - shown} left)
          </button>
        </div>
      )}
    </section>
  );
}
