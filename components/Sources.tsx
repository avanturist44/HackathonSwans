"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Entry, SourceRef } from "@/lib/types";
import { KIND_LABEL, longDate } from "./format";
import { CrossIcon, ExternalIcon } from "./icons";

/**
 * Source citations. Every chip on a page opens the cited Clio entry in a side
 * drawer. The entries map is provided once per page by <SourcesProvider>.
 */

interface Opened {
  entry: Entry;
  page: number | null;
}

interface SourcesCtx {
  entries: Record<string, Entry>;
  open: (entryId: string, page?: number | null) => void;
}

const Ctx = createContext<SourcesCtx | null>(null);

export function SourcesProvider({ entries, children }: { entries: Record<string, Entry>; children: ReactNode }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback(
    (entryId: string, page?: number | null) => {
      const entry = entries[entryId];
      if (!entry) return;
      returnFocus.current = document.activeElement as HTMLElement | null;
      setOpened({ entry, page: page ?? null });
    },
    [entries],
  );

  const close = useCallback(() => {
    setOpened(null);
    const el = returnFocus.current;
    if (el && typeof el.focus === "function") setTimeout(() => el.focus(), 0);
  }, []);

  const value = useMemo(() => ({ entries, open }), [entries, open]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {opened && <SourceDrawer opened={opened} onClose={close} />}
    </Ctx.Provider>
  );
}

function useSources(): SourcesCtx {
  return useContext(Ctx) ?? { entries: {}, open: () => {} };
}

export function SourceChip({ source }: { source: SourceRef }) {
  const { entries, open } = useSources();
  const entry = entries[source.entryId];
  const label = source.label || "SOURCE";
  if (!entry) {
    return (
      <button type="button" className="chip" disabled title="This source is not in the loaded case file">
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="chip"
      aria-haspopup="dialog"
      aria-label={`Source: ${label}, ${entry.title}`}
      onClick={() => open(source.entryId, source.page)}
    >
      {label}
    </button>
  );
}

/** A row of chips; renders nothing when there are no sources. `max` collapses the rest behind a toggle. */
export function SourceChips({ sources, max }: { sources: SourceRef[] | null | undefined; max?: number }) {
  const [all, setAll] = useState(false);
  if (!sources || sources.length === 0) return null;
  const limit = max && !all ? max : sources.length;
  const hidden = sources.length - limit;
  return (
    <span className="chips">
      {sources.slice(0, limit).map((s, i) => (
        <SourceChip key={`${s.entryId}-${i}`} source={s} />
      ))}
      {hidden > 0 && (
        <button type="button" className="chip" onClick={() => setAll(true)} aria-label={`Show ${hidden} more sources`}>
          +{hidden} MORE
        </button>
      )}
    </span>
  );
}

/** An entry title that opens the drawer (used in the timeline). */
export function EntryTitleButton({ entryId, children }: { entryId: string; children: ReactNode }) {
  const { entries, open } = useSources();
  if (!entries[entryId]) return <span>{children}</span>;
  return (
    <button type="button" className="btn-link" aria-haspopup="dialog" onClick={() => open(entryId)}>
      {children}
    </button>
  );
}

function SourceDrawer({ opened, onClose }: { opened: Opened; onClose: () => void }) {
  const { entry, page } = opened;
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && panel.current) {
        const focusables = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, entry.id]);

  const href = entry.url ? (page ? `${entry.url}#page=${page}` : entry.url) : null;
  const titleId = `drawer-title-${entry.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="drawer-head">
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div className="kind">
              {KIND_LABEL[entry.kind] ?? entry.kind.toUpperCase()} · {longDate(entry.date ?? entry.updatedAt)}
              {page ? ` · PAGE ${page}` : ""}
            </div>
            <h2 id={titleId} className="h2" style={{ overflowWrap: "anywhere" }}>
              {entry.title || "Untitled entry"}
            </h2>
            {entry.author && <div className="small muted-2">By {entry.author}</div>}
          </div>
          <button ref={closeBtn} type="button" className="icon-btn" onClick={onClose} aria-label="Close source">
            <CrossIcon color="currentColor" size={14} />
          </button>
        </div>
        <div className="drawer-body">
          {href && (
            <div>
              <a className="btn btn-sm" href={href} target="_blank" rel="noopener noreferrer">
                Open original
                <ExternalIcon />
              </a>
            </div>
          )}
          {entry.text ? (
            <p className="drawer-text">{entry.text}</p>
          ) : (
            <p className="empty">No text was extracted for this entry.</p>
          )}
        </div>
      </div>
    </>
  );
}
