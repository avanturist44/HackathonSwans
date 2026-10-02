"use client";

import { useEffect } from "react";

/** Records "now" as the last time the brief was opened, a few seconds after it renders. */
export function LastOpenedMarker() {
  useEffect(() => {
    const t = setTimeout(() => {
      document.cookie = `cb_last_opened=${new Date().toISOString()}; path=/; max-age=31536000; samesite=lax`;
    }, 3000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
