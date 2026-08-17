"use client";

import Image from "next/image";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useState } from "react";

type PostListItem = {
  id: string | number;
  title: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

// The shared name that ties a grid tile to the big slideshow image so the View
// Transitions API morphs one into the other. Only ever assigned to a single
// element at a time (the tile while closed, the big image while open).
const HERO = "km-slide";

// Minimal View Transitions wrapper: run the DOM update inside a transition when
// the browser supports it, else just apply it. flushSync forces React to commit
// synchronously so the transition's "after" snapshot reflects the new state.
type ViewTransition = { finished: Promise<void> };
type WithVT = Document & {
  startViewTransition?: (cb: () => void) => ViewTransition;
};
function runViewTransition(update: () => void): ViewTransition {
  const doc = document as WithVT;
  if (!doc.startViewTransition) {
    update();
    return { finished: Promise.resolve() };
  }
  return doc.startViewTransition(() => flushSync(update));
}

// Filename caption, matching the labels used in the intro scene.
function fileNameOf(url: string) {
  const path = decodeURIComponent(url.split("?")[0]);
  return path.slice(path.lastIndexOf("/") + 1) || url;
}

// The landing-page grid, plus a hover caption shown dead center in the big
// "Karl / Monies" title style from the intro. Clicking a tile opens a fullscreen
// slideshow that steps through every image with the arrow keys or on-screen
// controls; opening, closing, and paging run through View Transitions so the
// tile morphs into the big image (and back).
export default function Grid({ posts }: { posts: PostListItem[] | null }) {
  const [caption, setCaption] = useState<string | null>(null);
  // Index into `slides` of the open slideshow image, or null when it's closed.
  const [active, setActive] = useState<number | null>(null);
  // The tile that owns the shared `view-transition-name`. Tracked separately from
  // `active` so it can be named in the closed-state snapshot (before open / after
  // close) while the big image is named in the open-state snapshot — the two are
  // never named at once, which the View Transitions API requires.
  const [hero, setHero] = useState<number | null>(null);

  // Only images can be shown, so the slideshow steps through this filtered list.
  const slides = (posts ?? []).filter((p) => p.imageUrl);

  const open = useCallback((i: number) => {
    // Name the tile first (committed synchronously) so it's captured as the
    // transition's start, then flip to the open state where the big image is
    // named — the browser tweens between the two.
    flushSync(() => setHero(i));
    runViewTransition(() => setActive(i));
  }, []);

  const close = useCallback(() => {
    runViewTransition(() => setActive(null)).finished.finally(() =>
      setHero(null),
    );
  }, []);

  const step = useCallback(
    (dir: number) => {
      if (active === null) return;
      const next = (active + dir + slides.length) % slides.length;
      // Keep the hero in sync so a later close morphs back to the tile currently
      // on screen; the big image keeps its name, so the slide itself cross-fades.
      runViewTransition(() => {
        setActive(next);
        setHero(next);
      });
    },
    [active, slides.length],
  );

  // Arrow keys page through the slideshow; Escape closes it. Only wired up while
  // the slideshow is open.
  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close, step]);

  const current = active === null ? null : slides[active];

  return (
    <div className="relative flex flex-1 flex-col bg-zinc-50 font-sans">
      <main className="flex w-full flex-1 flex-col px-5 pt-5">
        {slides.length > 0 ? (
          <ul className="grid grid-cols-12 gap-20">
            {slides.map((post, i) => (
              <li
                key={String(post.id)}
                className="relative aspect-square w-full cursor-pointer"
                // Named only while closed so it never clashes with the big image.
                style={
                  active === null && i === hero
                    ? { viewTransitionName: HERO }
                    : undefined
                }
                onMouseEnter={() => setCaption(fileNameOf(post.imageUrl!))}
                onMouseLeave={() => setCaption(null)}
                onClick={() => open(i)}
              >
                <Image
                  src={post.imageUrl!}
                  alt={post.imageAlt ?? post.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 8vw"
                  className="object-contain"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No posts yet.</p>
        )}
      </main>

      {/* Hover caption — hidden while the slideshow is open so it doesn't sit on
          top of the big image. */}
      {caption && active === null ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <span
            className="text-center text-black"
            style={{
              fontFamily:
                '"Graphik-Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
              fontSize: 200,
              // Graphik-Black is a single-weight face registered at 400; keep the
              // weight normal so the browser doesn't synthetically bold it.
              fontWeight: 400,
              lineHeight: 1,
            }}
          >
            {`KM_${caption}`}
          </span>
        </div>
      ) : null}

      {/* Fullscreen slideshow. Clicking the backdrop closes it; the arrows page
          through, and the filename rides along the bottom. */}
      {current ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-50/95"
          onClick={close}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute right-6 top-6 text-3xl leading-none text-zinc-800 hover:text-black"
          >
            ✕
          </button>

          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            className="absolute left-6 top-1/2 -translate-y-1/2 text-5xl leading-none text-zinc-800 hover:text-black"
          >
            ‹
          </button>

          {/* The big image carries the shared name while open, so it morphs from
              (and back to) the grid tile. Clicks on it shouldn't close. */}
          <div
            className="relative h-[80vh] w-[80vw]"
            style={{ viewTransitionName: HERO }}
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={current.imageUrl!}
              alt={current.imageAlt ?? current.title}
              fill
              sizes="80vw"
              className="object-contain"
              priority
            />
          </div>

          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-5xl leading-none text-zinc-800 hover:text-black"
          >
            ›
          </button>

          <div className="pointer-events-none absolute bottom-6 left-0 right-0 text-center text-sm text-zinc-600">
            {fileNameOf(current.imageUrl!)} · {active! + 1}/{slides.length}
          </div>
        </div>
      ) : null}
    </div>
  );
}
