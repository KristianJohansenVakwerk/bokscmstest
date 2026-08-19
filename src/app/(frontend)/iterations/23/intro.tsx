"use client";

import { useEffect, useState } from "react";

import { useView } from "../../view-context";
import Grid, { type PostListItem } from "./grid";

const LOGO_FADE_MS = 700;

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

  // Contact hides everything for now — a blank canvas keeping the page height.
  if (mode === "contact") return <div className="flex flex-1 bg-zinc-50" />;

  // The wordmark overlay is up during the intro and while it fades out.
  const introActive = mode === "intro" || (mode === "index" && !revealed);

  return (
    <div className="relative flex flex-1 flex-col bg-zinc-50">
      <Grid posts={posts} />

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
