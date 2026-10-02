"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshIcon } from "./icons";

interface Status {
  running: boolean;
  step: string;
  progress: { done: number; total: number } | null;
  error: string | null;
  hasDigest: boolean;
}

/**
 * Starts the digest pipeline (POST /api/digest) and polls its status every 2s.
 * Full form for the empty state; compact form for "Refresh from Clio" in the top bar.
 */
export function DigestRunner({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasRunning = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/digest", { cache: "no-store" });
      if (!res.ok) throw new Error(`Status check failed (${res.status})`);
      const s = (await res.json()) as Status;
      setStatus(s);
      if (s.running) {
        wasRunning.current = true;
        timer.current = setTimeout(poll, 2000);
      } else {
        if (s.error) setError(s.error);
        if (wasRunning.current) {
          wasRunning.current = false;
          router.refresh();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server");
    }
  }, [router]);

  // Pick up a run that is already in progress (e.g. after a page reload).
  useEffect(() => {
    poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(compact ? { force: true } : {}),
      });
      if (!res.ok) throw new Error(`Could not start (${res.status})`);
      wasRunning.current = true;
      if (timer.current) clearTimeout(timer.current);
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the digest");
    } finally {
      setStarting(false);
    }
  }

  const running = Boolean(status?.running) || starting;
  const p = status?.progress;
  const pctDone = p && p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : null;
  const stepText = status?.step || (starting ? "Starting" : "");

  if (compact) {
    return (
      <div className="runner runner-compact" aria-live="polite">
        {running && (
          <span className="runner-step">
            {stepText}
            {p ? ` · ${p.done}/${p.total}` : ""}
          </span>
        )}
        {error && !running && <span className="error">{error}</span>}
        <button type="button" className="btn btn-xs" onClick={start} disabled={running}>
          <RefreshIcon />
          {running ? "Refreshing" : "Refresh from Clio"}
        </button>
      </div>
    );
  }

  return (
    <div className="runner" aria-live="polite">
      <div>
        <button type="button" className="btn btn-primary" onClick={start} disabled={running}>
          {running ? "Building the case brief" : "Build the case brief"}
        </button>
      </div>
      {running && (
        <>
          <div className="runner-step">
            {stepText || "Working"}
            {p ? ` · ${p.done} of ${p.total}` : ""}
          </div>
          {pctDone != null && (
            <div
              className="meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pctDone}
              aria-label="Digest progress"
              style={{ maxWidth: 420 }}
            >
              <div style={{ width: `${pctDone}%` }} />
            </div>
          )}
        </>
      )}
      {error && !running && <div className="error">{error}</div>}
    </div>
  );
}
