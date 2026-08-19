"use client";

import { useView, type ViewMode } from "./view-context";

// Global site nav: switches the active view between the index (thumbnail grid)
// and contact. "intro" is the wordmark landing shown before either is picked —
// it's the placeholder label and can't be re-selected once left.
export default function SiteNav() {
  const { mode, setMode } = useView();

  return (
    <select
      value={mode}
      onChange={(e) => setMode(e.target.value as ViewMode)}
      className="h-8 text-sm focus:outline-none"
      style={{
        fontFamily:
          '"Graphik-Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
        // Graphik-Black is a single-weight face registered at 400; keep the
        // weight normal so the browser doesn't synthetically bold it.
        fontWeight: 400,
      }}
    >
      <option value="intro" disabled hidden>
        KM
      </option>
      <option value="index">Index</option>
      <option value="contact">Contact</option>
    </select>
  );
}
