"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { useView } from "../../view-context";
import Grid, { type PostListItem } from "./grid";

const SHOWN_COUNT = 15; // images visible at a time
const ROTATE_MS = 1000; // how often one tile is swapped for another
const CROSSFADE_MS = 800; // dissolve duration
const LOGO_FADE_MS = 700;

// Fisher–Yates pick of up to n distinct items.
function sample<T>(arr: T[], n: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

// The image inside a revealed tile: fades in on mount, and fades out when `on`
// flips to false (just before the parent unmounts it).
function FadeCell({ url, on }: { url: string; on: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Two rAFs so the element paints at opacity 0 before transitioning to 1.
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setMounted(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, []);
  return (
    <Image
      src={url}
      alt=""
      fill
      sizes="(max-width: 768px) 100vw, 8vw"
      className="object-cover"
      style={{
        opacity: mounted && on ? 1 : 0,
        transition: `opacity ${CROSSFADE_MS}ms ease-out`,
      }}
    />
  );
}

// The intro backdrop: the full grid skeleton (every tile, exactly the grid
// view's layout), but only SHOWN_COUNT tiles hold an image at once. Every
// ROTATE_MS one shown tile crossfades out while a random empty one fades in, so
// ~15 images drift across the grid.
function CrossfadeGrid({ posts }: { posts: PostListItem[] }) {
  const slides = useMemo(() => posts.filter((p) => p.imageUrl), [posts]);
  const ids = useMemo(() => slides.map((s) => String(s.id)), [slides]);

  // Per-tile state: true = shown, false = fading out, absent = empty.
  const [active, setActive] = useState<Map<string, boolean>>(new Map());
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (ids.length === 0) return;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const seed = () => {
      const init = new Map<string, boolean>();
      sample(ids, SHOWN_COUNT).forEach((id) => init.set(id, true));
      setActive(init);
    };
    seed();

    const rotate = () => {
      const cur = activeRef.current;
      const shown = [...cur].filter(([, v]) => v).map(([k]) => k);
      const empty = ids.filter((id) => !cur.has(id));
      if (shown.length === 0 || empty.length === 0) return;
      const outId = shown[Math.floor(Math.random() * shown.length)];
      const inId = empty[Math.floor(Math.random() * empty.length)];
      const next = new Map(cur);
      next.set(outId, false); // begin fading out
      next.set(inId, true); // fade in
      setActive(next);
      // Drop the faded-out tile once its dissolve finishes (unless it got
      // re-activated in the meantime).
      timeouts.push(
        setTimeout(() => {
          setActive((prev) => {
            if (prev.get(outId) !== false) return prev;
            const n = new Map(prev);
            n.delete(outId);
            return n;
          });
        }, CROSSFADE_MS),
      );
    };

    const interval = setInterval(rotate, ROTATE_MS);
    return () => {
      clearInterval(interval);
      timeouts.forEach(clearTimeout);
    };
  }, [ids]);

  if (slides.length === 0) return null;

  return (
    <main className="flex w-full flex-1 flex-col px-5 pb-5 pt-14">
      <ul className="flex flex-wrap items-center justify-center gap-20">
        {slides.map((s) => {
          const id = String(s.id);
          // Fixed height (uniform rows) + width from the stored aspect ratio,
          // set once — the skeleton never changes size, so nothing jumps.
          const aspect = s.width && s.height ? s.width / s.height : 1;
          const state = active.get(id);
          return (
            <li
              key={id}
              className="relative h-[60px] shrink-0"
              style={{ aspectRatio: aspect }}
            >
              {state !== undefined ? (
                <FadeCell url={s.imageUrl!} on={state} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

// Iteration 22 intro: the grid view's exact layout with only 15 images shown at
// a time (crossfading across the tiles), and the SVG wordmark laid over it at
// full viewport width (30px padding each side). Clicking fades the wordmark out
// and hands off to the interactive grid. The active view is driven by the global
// nav dropdown: "index" shows the grid, "contact" hides both intro and grid.
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
  if (mode === "contact") return <div className="flex flex-1 bg-white" />;

  // The grid appears only once the wordmark has finished fading out.
  if (mode === "index" && revealed) return <Grid posts={posts} />;

  return (
    <div
      className="relative flex flex-1 cursor-pointer flex-col bg-white"
      onClick={() => mode === "intro" && setMode("index")}
    >
      {/* Backdrop: full grid skeleton, 15 images shown at a time. */}
      <div className="pointer-events-none flex flex-1 flex-col">
        <CrossfadeGrid posts={posts ?? []} />
      </div>

      {/* Wordmark on top: viewport width minus 30px on each side, centered and
          pinned to the viewport so it stays put if the grid scrolls. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/karl-logo.svg"
        alt="Karl Monies"
        className="pointer-events-none fixed left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 transition-opacity ease-out"
        style={{
          width: "calc(100vw - 60px)",
          height: "auto",
          opacity: mode === "index" ? 0 : 1,
          transitionDuration: `${LOGO_FADE_MS}ms`,
        }}
      />
    </div>
  );
}
