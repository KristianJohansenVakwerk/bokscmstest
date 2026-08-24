"use client";

import { useEffect, useState } from "react";

import { useView } from "../../view-context";
import Grid, { type PostListItem } from "./grid";

const LOGO_FADE_MS = 700;
const CONTACT_FADE_MS = 180;

// Iteration 24 intro: like 23, but during the intro the grid THUMBNAILS are
// hidden — only the wordmark shows over an empty canvas. The overlay is
// pointer-events-none so the mouse still reaches the grid tiles, so hovering
// pops the big preview image up on mouse-move (the images reveal themselves).
// Clicking anywhere fades the wordmark out and shows the normal grid; the grid
// stays mounted throughout, so nothing reloads on handoff.
export default function Intro({ posts }: { posts: PostListItem[] | null }) {
  const { mode, setMode } = useView();
  const [revealed, setRevealed] = useState(false);

  // Once "index" is requested — by clicking the wordmark or picking it from the
  // nav dropdown — reveal the grid after the wordmark has faded out. The fade
  // itself is derived from `mode` below, so both paths share the transition.
  useEffect(() => {
    if (mode !== "index" || revealed) return;
    const t = window.setTimeout(() => setRevealed(true), LOGO_FADE_MS);
    return () => window.clearTimeout(t);
  }, [mode, revealed]);

  // The wordmark overlay is up during the intro and while it fades out.
  const introActive = mode === "intro" || (mode === "index" && !revealed);

  // Fade the contact card in AND out. `contactMounted` keeps it in the tree
  // through the fade-out; `contactShown` drives the opacity. On entry: mount,
  // then flip to shown next frame so the transition runs. On exit: hide, then
  // unmount once the fade has finished.
  const [contactMounted, setContactMounted] = useState(false);
  const [contactShown, setContactShown] = useState(false);
  useEffect(() => {
    if (mode === "contact") {
      setContactMounted(true);
      const raf = requestAnimationFrame(() => setContactShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setContactShown(false);
    const t = window.setTimeout(() => setContactMounted(false), CONTACT_FADE_MS);
    return () => window.clearTimeout(t);
  }, [mode]);

  return (
    <div
      className={`relative flex flex-1 flex-col bg-zinc-50 ${
        introActive ? "cursor-pointer" : ""
      }`}
      // The wordmark overlay is click-through (pointer-events-none), so the
      // click that leaves the intro is caught here on the wrapper instead.
      onClick={() => mode === "intro" && setMode("index")}
    >
      {/* Thumbnails are hidden while the wordmark intro is up; hovering still
          fires the big preview. They reveal once the intro is dismissed. */}
      <Grid posts={posts} hideThumbs={mode === "intro"} />

      {contactMounted ? (
        // Centered in the viewport (both axes); sits under the dropdown layer
        // (z-50), which stays pinned at the top. Fades in and out.
        <div
          className="fixed inset-0 z-40 flex items-center justify-center transition-opacity ease-out"
          style={{
            opacity: contactShown ? 1 : 0,
            transitionDuration: `${CONTACT_FADE_MS}ms`,
          }}
        >
          {/* A white card floated over the grid. 375px wide but clamped to fit
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
      ) : null}

      {introActive ? (
        // Full-viewport wordmark holder. Click-through (pointer-events-none) so
        // the mouse reaches the grid tiles beneath and hover previews still fire;
        // the click itself is handled on the wrapper above. z-[60] keeps the name
        // ON TOP of the big preview images (z-50) as they reveal on hover/loop.
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/karl-logo.svg"
            alt="Karl Monies"
            className="pointer-events-none transition-opacity ease-out"
            style={{
              width: "calc(100vw - 60px)",
              height: "auto",
              opacity: mode === "index" ? 0 : 1,
              transitionDuration: `${LOGO_FADE_MS}ms`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
