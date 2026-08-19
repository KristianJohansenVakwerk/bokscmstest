"use client";

import { useView, type ViewMode } from "./view-context";

// Global site nav: switches the active view between the index (thumbnail grid)
// and contact. "intro" is the wordmark landing shown before either is picked —
// it's the placeholder label and can't be re-selected once left.
export default function SiteNav() {
  const { mode, setMode } = useView();

  return (
    <select value={mode} onChange={(e) => setMode(e.target.value as ViewMode)}>
      <option value="intro" disabled hidden>
        Menu
      </option>
      <option value="index">Index</option>
      <option value="contact">Contact</option>
    </select>
  );
}
