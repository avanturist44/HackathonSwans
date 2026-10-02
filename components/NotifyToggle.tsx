"use client";

import { useState } from "react";

/** "Email me when the case moves" (visual only for now; no endpoint behind it). */
export function NotifyToggle() {
  const [on, setOn] = useState(false);
  return (
    <div className="check-row" style={{ paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
      <input type="checkbox" id="notify" checked={on} onChange={(e) => setOn(e.target.checked)} />
      <label htmlFor="notify" style={{ fontSize: 14 }}>
        Email me when the case moves
      </label>
    </div>
  );
}
