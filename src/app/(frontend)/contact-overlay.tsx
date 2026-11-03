"use client";

import { useEffect, useState } from "react";

import { useView } from "./view-context";

const CONTACT_FADE_MS = 180;

// Global contact card (from iteration 24), opened from the nav and shown on top
// of whatever page is current. Closes on Escape or a click outside the card.
export default function ContactOverlay() {
  const { contactOpen, setContactOpen } = useView();

  // Fade in AND out. `mounted` keeps the card in the tree through the fade-out;
  // `shown` drives the opacity. On open: mount one frame, flip to shown the next
  // so the transition runs. On close: hide, then unmount once the fade is done.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (contactOpen) {
      let raf = requestAnimationFrame(() => {
        setMounted(true);
        raf = requestAnimationFrame(() => setShown(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    const hide = requestAnimationFrame(() => setShown(false));
    const t = window.setTimeout(() => setMounted(false), CONTACT_FADE_MS);
    return () => {
      cancelAnimationFrame(hide);
      window.clearTimeout(t);
    };
  }, [contactOpen]);

  useEffect(() => {
    if (!contactOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContactOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contactOpen, setContactOpen]);

  if (!mounted) return null;

  return (
    // Centered in the viewport (both axes); sits under the dropdown layer
    // (z-50), which stays pinned at the top. Clicking outside the card closes it.
    <div
      className="fixed inset-0 z-40 flex items-center justify-center transition-opacity ease-out"
      style={{
        opacity: shown ? 1 : 0,
        transitionDuration: `${CONTACT_FADE_MS}ms`,
      }}
      onClick={() => setContactOpen(false)}
    >
      {/* A white card floated over the page. 375px wide but clamped to fit
          mobile. Height fills the viewport on mobile; on sm+ it's five grid
          rows tall (5*69 tile + 4*80 gap = 665px). */}
      <div
        className="flex h-[100dvh] w-[min(375px,calc(100vw-40px))] items-center justify-center bg-white p-4 text-center text-sm text-black sm:h-[665px]"
        style={{
          // Match the captions and nav: text-sm in the single-weight
          // Graphik-Black face, kept at 400 to avoid synthetic bolding.
          fontFamily:
            '"Graphik-Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 400,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p>
          Karl Monies
          <br />
          IG, Mail
          <br />
          Represented by Gallery name
        </p>
      </div>
    </div>
  );
}
