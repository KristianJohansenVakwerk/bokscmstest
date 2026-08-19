"use client";

import { useEffect, useState } from "react";

import { useView } from "../../view-context";
import Grid, { type PostListItem } from "./grid";

const LOGO_FADE_MS = 700;
const CONTACT_FADE_MS = 180;

// Iteration 23 intro: the full interactive grid (every image) with the SVG
// wordmark laid over it at full viewport width (30px padding each side). Unlike
// 22 there's no crossfade rotation — all tiles show at once. Clicking (or
// picking "Index" from the nav) fades the wordmark out and hands off to the
// grid. The grid stays mounted throughout, so nothing reloads on handoff; a
// transparent overlay keeps it non-interactive while the wordmark is up.
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
    <div className="relative flex flex-1 flex-col bg-white">
      <Grid posts={posts} />

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
        // Transparent, full-viewport click target: captures the click, blocks
        // grid hover while the wordmark is up, and holds the wordmark centered.
        <div
          className="fixed inset-0 z-20 flex cursor-pointer items-center justify-center"
          onClick={() => mode === "intro" && setMode("index")}
        >
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
