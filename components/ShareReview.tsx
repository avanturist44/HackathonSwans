"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShareState, SourceRef } from "@/lib/types";
import { SourceChip } from "./Sources";

/** Client pieces of the share review: provider/coverage/link controls and the three decision columns. */

type ShareAction =
  | { action: "decide"; entryId: string; decision: "share" | "withhold" | null }
  | { action: "provider"; provider: string }
  | { action: "coverage"; show: boolean }
  | { action: "link" };

async function postShare(body: ShareAction): Promise<{ share: ShareState; url?: string }> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j && typeof j.error === "string") msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function useShareAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(body: ShareAction) {
    setError(null);
    setBusy(true);
    try {
      const out = await postShare(body);
      startTransition(() => router.refresh());
      return out;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy: busy || pending, error };
}

/* ---------------- Header controls ---------------- */

export function ProviderSelect({ providers, current }: { providers: string[]; current: string }) {
  const { run, busy, error } = useShareAction();
  const options = providers.includes(current) || !current ? providers : [current, ...providers];
  if (options.length === 0) {
    return <h1 style={{ margin: "4px 0 6px", fontSize: 28, fontWeight: 700 }}>No providers found</h1>;
  }
  return (
    <>
      <label htmlFor="provider-select" className="sr-only">
        Provider to share with
      </label>
      <select
        id="provider-select"
        className="select-lg"
        value={current}
        disabled={busy}
        onChange={(e) => run({ action: "provider", provider: e.target.value })}
      >
        {!current && <option value="">Choose a provider</option>}
        {options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {error && <div className="error">{error}</div>}
    </>
  );
}

export function CoverageToggle({ show }: { show: boolean }) {
  const { run, busy, error } = useShareAction();
  const [checked, setChecked] = useState(show);
  return (
    <div className="check-row">
      <input
        type="checkbox"
        id="show-coverage"
        checked={checked}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.checked;
          setChecked(next);
          const out = await run({ action: "coverage", show: next });
          if (!out) setChecked(!next);
        }}
      />
      <label htmlFor="show-coverage" style={{ fontSize: 14 }}>
        Show coverage (yes/no only)
      </label>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function SendLink({ existingUrl, disabled }: { existingUrl: string | null; disabled?: boolean }) {
  const { run, busy, error } = useShareAction();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Show the link that is already live, if any (origin is only known in the browser).
  useEffect(() => {
    if (existingUrl) setUrl(window.location.origin + existingUrl);
  }, [existingUrl]);

  async function send() {
    const out = await run({ action: "link" });
    if (out?.url) {
      setUrl(window.location.origin + out.url);
      setCopied(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
      <button type="button" className="btn btn-primary" onClick={send} disabled={busy || disabled}>
        {busy ? "Creating link" : "Send secure link"}
      </button>
      {url && (
        <div className="link-box" role="status">
          <code>{url}</code>
          <button type="button" className="btn btn-xs" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

/* ---------------- Decision columns ---------------- */

export interface ShareRow {
  entryId: string;
  title: string;
  shareable: number;
  reason: string;
  manual: boolean;
  source: SourceRef;
}

function pctText(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function ReviewColumn({ items }: { items: ShareRow[] }) {
  const { run, busy, error } = useShareAction();
  return (
    <section aria-labelledby="review-h" className="card card-accent" style={{ flex: "1.25 1 360px", gap: 14, padding: 22 }}>
      <h2 id="review-h" className="h2" style={{ fontSize: 17 }}>
        Needs your call <span className="sub">· {items.length}</span>
      </h2>
      {error && <div className="error">{error}</div>}
      {items.length === 0 ? (
        <p className="empty" style={{ margin: 0 }}>
          Nothing needs your call. The triage model was confident about every entry.
        </p>
      ) : (
        items.map((it) => (
          <div key={it.entryId} className="review-item">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{it.title}</span>
              <span className="pct pct-amber">{pctText(it.shareable)} shareable</span>
            </div>
            {it.reason && <div className="detail">{it.reason}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => run({ action: "decide", entryId: it.entryId, decision: "share" })}
                aria-label={`Share: ${it.title}`}
              >
                Share
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => run({ action: "decide", entryId: it.entryId, decision: "withhold" })}
                aria-label={`Withhold: ${it.title}`}
              >
                Withhold
              </button>
              <SourceChip source={it.source} />
            </div>
          </div>
        ))
      )}
    </section>
  );
}

const SHOW = 8;

export function DecidedColumn({ kind, items }: { kind: "share" | "withhold"; items: ShareRow[] }) {
  const { run, busy, error } = useShareAction();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOW);
  const isShare = kind === "share";
  const id = isShare ? "share-h" : "hold-h";
  const other = isShare ? "withhold" : "share";

  return (
    <section aria-labelledby={id} className="card" style={{ flex: "1 1 280px", gap: 6, padding: 22 }}>
      <h2 id={id} className="h2" style={{ fontSize: 17, marginBottom: 6 }}>
        <span
          className="dot"
          style={{ background: isShare ? "var(--green)" : "var(--muted)", marginRight: 8, verticalAlign: 2 }}
        />
        {isShare ? "Will share" : "Withheld"} <span className="sub">· {items.length}</span>
      </h2>
      {error && <div className="error">{error}</div>}
      {items.length === 0 ? (
        <p className="empty" style={{ margin: 0 }}>
          {isShare ? "Nothing will be shared yet." : "Nothing is withheld."}
        </p>
      ) : (
        <>
          {shown.map((it) => (
            <div key={it.entryId} className="kv-row">
              <span className="grow" style={{ overflowWrap: "anywhere" }}>
                {it.title}
                {it.manual && <span className="small muted-2"> · your call</span>}
              </span>
              <span className="pct">{pctText(isShare ? it.shareable : 1 - it.shareable)}</span>
              <button
                type="button"
                className="btn btn-xs"
                disabled={busy}
                onClick={() => run({ action: "decide", entryId: it.entryId, decision: other })}
                aria-label={`${isShare ? "Withhold" : "Share"} instead: ${it.title}`}
                title={isShare ? "Move to withheld" : "Move to will share"}
              >
                {isShare ? "Withhold" : "Share"}
              </button>
            </div>
          ))}
          {items.length > SHOW && (
            <div style={{ paddingTop: 8 }}>
              <button type="button" className="btn btn-xs" onClick={() => setAll((v) => !v)} aria-expanded={all}>
                {all ? "Show fewer" : `Show all ${items.length}`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
