"use client";

import { usePathname, useRouter } from "next/navigation";

import { useView, type ViewMode } from "./view-context";

// Global site nav.
//
// On the final site it's route-based: "KM" goes to the landing page, "Index"
// goes to /mosaic, and "Contact" opens the global contact overlay on top of the
// current page.
//
// On /iterations pages it keeps the old in-page behaviour, switching `mode`.
export default function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode, contactOpen, setContactOpen } = useView();
  const inIterations = pathname.startsWith("/iterations");

  const value: ViewMode = inIterations
    ? mode
    : contactOpen
      ? "contact"
      : pathname === "/mosaic"
        ? "index"
        : "intro";

  const onChange = (next: ViewMode) => {
    if (inIterations) {
      setMode(next);
      return;
    }
    if (next === "contact") {
      setContactOpen(true);
      return;
    }
    setContactOpen(false);
    if (next === "index" && pathname !== "/mosaic") router.push("/mosaic");
    if (next === "intro" && pathname !== "/") router.push("/");
  };

  // On /iterations the menu only appears once the visitor has clicked past the
  // wordmark intro. The final site always shows it (`mode` isn't used there).
  if (inIterations && mode === "intro") return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ViewMode)}
      className="h-8 text-sm focus:outline-none"
      style={{
        fontFamily:
          '"Graphik-Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
        // Graphik-Black is a single-weight face registered at 400; keep the
        // weight normal so the browser doesn't synthetically bold it.
        fontWeight: 400,
      }}
    >
      {/* On the final site KM goes back to the landing page; on /iterations it
          stays a placeholder label that can't be re-selected. */}
      <option value="intro" disabled={inIterations} hidden={inIterations}>
        KM
      </option>
      <option value="index">Index</option>
      <option value="contact">Contact</option>
    </select>
  );
}
