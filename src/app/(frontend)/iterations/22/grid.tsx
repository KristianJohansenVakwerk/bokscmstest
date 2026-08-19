"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export type PostListItem = {
  id: string | number;
  title: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string | null;
  backgroundColor: string | null;
  // Stored image dimensions — used by the intro to size scattered images; the
  // grid itself learns the true ratio from the loaded thumbnail.
  width?: number | null;
  height?: number | null;
};

// The grid's column model, mirrored from the Tailwind classes on the <ul> below
// (grid-cols-12 with gap-20 = 5rem). Used to size the hover preview in columns.
const COLS = 12;
const GAP = 80; // px, Tailwind gap-20
const LANDSCAPE_SPAN = 5; // columns wide when the image is landscape
const PORTRAIT_SPAN = 3; // columns wide when the image is portrait
const CURSOR_OFFSET = 24; // px between the cursor and the preview
const EDGE_MARGIN = 16; // px the preview keeps from the viewport edge
// How far outside the viewport a tile starts loading, so images are ready just
// before they scroll into view.
const PRELOAD_MARGIN = "300px 0px";

// Caption geometry, mirrored from the tile's caption span below — the hover
// preview uses it to steer clear of the label so it never covers it.
const CAPTION_FONT =
  '400 14px "Graphik-Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
const CAPTION_PADDING = 16; // px-2 on both sides
const CAPTION_GAP = 8; // mt-2 gap below the tile
const CAPTION_HEIGHT = 28; // text-sm line + py-1 top/bottom
const CAPTION_CLEARANCE = 12; // px of breathing room the preview keeps from it

// Filename caption, matching the labels used in the intro.
function fileNameOf(url: string) {
  const path = decodeURIComponent(url.split("?")[0]);
  return path.slice(path.lastIndexOf("/") + 1) || url;
}

type Preview = {
  url: string;
  alt: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

// A lazy-loaded thumbnail that fades in once its image decodes. Reports the
// loaded element so the parent can record the true aspect ratio.
function Thumb({
  url,
  alt,
  onReady,
}: {
  url: string;
  alt: string;
  onReady: (img: HTMLImageElement) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes="(max-width: 768px) 100vw, 8vw"
      className={`object-cover transition-opacity duration-700 ease-out ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
      onLoad={(e) => {
        setLoaded(true);
        onReady(e.currentTarget);
      }}
    />
  );
}

// The landing-page grid. Tiles lazy-load via an IntersectionObserver — each
// image only mounts (and only requests) once it nears the viewport. Hovering a
// tile pops the full image up big, placed once next to where the cursor entered
// (it doesn't track further movement), sized in grid columns (5 for landscape,
// 3 for portrait) and flipped/clamped so it always stays fully on screen.
export default function Grid({ posts }: { posts: PostListItem[] | null }) {
  const gridRef = useRef<HTMLUListElement>(null);
  // True aspect ratio (w/h) per image url, learned once each thumbnail loads —
  // the optimized image is EXIF-corrected, so this beats the stored dimensions.
  const ratios = useRef<Map<string, number>>(new Map());
  // Cached canvas 2D context for measuring caption text width (see previewAt).
  const measureCtx = useRef<CanvasRenderingContext2D | null>(null);
  const captionWidth = (text: string) => {
    let ctx = measureCtx.current;
    if (!ctx) {
      ctx = document.createElement("canvas").getContext("2d");
      measureCtx.current = ctx;
    }
    if (!ctx) return text.length * 8 + CAPTION_PADDING;
    ctx.font = CAPTION_FONT;
    return ctx.measureText(text).width + CAPTION_PADDING;
  };
  const [preview, setPreview] = useState<Preview | null>(null);

  // Lazy-load state: the set of tile ids that have scrolled near the viewport.
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const tilesRef = useRef<Set<Element>>(new Set());

  // One shared observer for the whole grid. It reveals a tile the first time it
  // nears the viewport, then stops watching it (each image loads once).
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          let next = prev;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const id = entry.target.getAttribute("data-id");
            if (id && !prev.has(id)) {
              if (next === prev) next = new Set(prev);
              next.add(id);
              io.unobserve(entry.target);
            }
          }
          return next;
        });
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observerRef.current = io;
    // Observe tiles that mounted before this effect ran.
    tilesRef.current.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      observerRef.current = null;
    };
  }, []);

  // Stable ref callback shared by every tile: register the element and start
  // observing it (or queue it until the observer exists).
  const setTileRef = useCallback((el: HTMLLIElement | null) => {
    if (!el) return;
    tilesRef.current.add(el);
    observerRef.current?.observe(el);
  }, []);

  // Place a preview horizontally next to the cursor's entry x and vertically
  // centered on screen, sized to the image's orientation, kept fully within the
  // viewport (flip to the other side of the cursor near an edge, then clamp;
  // shrink to fit if taller than the viewport).
  const previewAt = (
    clientX: number,
    tileRect: DOMRect,
    url: string,
    alt: string,
  ): Preview => {
    const gridW = gridRef.current?.clientWidth ?? window.innerWidth;
    const colW = (gridW - (COLS - 1) * GAP) / COLS;
    const ratio = ratios.current.get(url) ?? 1.4; // assume landscape until known
    const span = ratio >= 1 ? LANDSCAPE_SPAN : PORTRAIT_SPAN;

    let w = span * colW + (span - 1) * GAP;
    let h = w / ratio;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Shrink to fit vertically if a tall portrait would overflow the viewport.
    const maxH = vh - 2 * EDGE_MARGIN;
    if (h > maxH) {
      w *= maxH / h;
      h = maxH;
    }

    // The caption's on-screen box (mirrors the tile's caption span): centered
    // under the tile, one small line tall, a little below its bottom edge.
    const capW = captionWidth(`KM_${fileNameOf(url)}`);
    const capCenterX = tileRect.left + tileRect.width / 2;
    const capL = capCenterX - capW / 2;
    const capR = capCenterX + capW / 2;
    const capTop = tileRect.bottom + CAPTION_GAP;
    const capBottom = capTop + CAPTION_HEIGHT;

    // Vertical position is centered on screen; horizontal tracks the cursor's x
    // (to the right of it, flipping to the left near the edge).
    let x = clientX + CURSOR_OFFSET;
    let y = (vh - h) / 2;

    // When the preview's vertical span would cross the caption's row, keep it
    // clear of the label: push it to whichever side has room, and if neither
    // does, drop it below/above the caption instead. This guarantees the big
    // image never sits on top of the caption.
    if (y < capBottom && y + h > capTop) {
      const rightX = Math.max(clientX + CURSOR_OFFSET, capR + CAPTION_CLEARANCE);
      const leftX =
        Math.min(clientX - CURSOR_OFFSET, capL - CAPTION_CLEARANCE) - w;
      if (rightX + w + EDGE_MARGIN <= vw) {
        x = rightX;
      } else if (leftX >= EDGE_MARGIN) {
        x = leftX;
      } else if (capBottom + CAPTION_CLEARANCE + h + EDGE_MARGIN <= vh) {
        y = capBottom + CAPTION_CLEARANCE;
        if (x + w + EDGE_MARGIN > vw) x = clientX - CURSOR_OFFSET - w;
      } else {
        y = capTop - CAPTION_CLEARANCE - h;
        if (x + w + EDGE_MARGIN > vw) x = clientX - CURSOR_OFFSET - w;
      }
    } else if (x + w + EDGE_MARGIN > vw) {
      x = clientX - CURSOR_OFFSET - w;
    }

    x = Math.max(EDGE_MARGIN, Math.min(x, vw - w - EDGE_MARGIN));
    y = Math.max(EDGE_MARGIN, Math.min(y, vh - h - EDGE_MARGIN));

    return { url, alt, x, y, w, h };
  };

  const slides = (posts ?? []).filter((p) => p.imageUrl);

  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip bg-zinc-50 font-sans">
      <main className="flex w-full flex-1 flex-col px-5 pb-5 pt-14">
        {slides.length > 0 ? (
          <ul
            ref={gridRef}
            className="flex flex-wrap items-center justify-center gap-20"
          >
            {slides.map((post) => {
              const id = String(post.id);
              const url = post.imageUrl!;
              const alt = post.imageAlt ?? post.title;
              // Fixed HEIGHT (uniform rows) with fluid width from the stored
              // aspect ratio, set once so the tile size is fixed from first paint
              // and nothing jumps. Media stores EXIF-corrected width/height (see
              // the Media collection hook + backfill:media:dimensions), so rotated
              // portraits already have the right shape. object-cover fills the
              // tile so the backdrop never shows through while loading.
              const aspect =
                post.width && post.height ? post.width / post.height : 1;
              return (
                <li
                  key={id}
                  ref={setTileRef}
                  data-id={id}
                  className="group relative h-[60px] shrink-0 cursor-pointer"
                  style={{
                    aspectRatio: aspect,
                    backgroundColor: post.backgroundColor ?? undefined,
                  }}
                  onMouseEnter={(e) =>
                    setPreview(
                      previewAt(
                        e.clientX,
                        e.currentTarget.getBoundingClientRect(),
                        url,
                        alt,
                      ),
                    )
                  }
                  onMouseLeave={() => setPreview(null)}
                >
                  {/* Only mount the image once the tile nears the viewport, so
                      off-screen thumbnails are never requested; it fades in on
                      load. */}
                  {visible.has(id) ? (
                    <Thumb
                      url={url}
                      alt={alt}
                      onReady={(img) => {
                        // Learn the true ratio only for the hover preview — it
                        // does NOT resize the tile, so the grid layout stays put.
                        if (img.naturalWidth && img.naturalHeight) {
                          ratios.current.set(
                            url,
                            img.naturalWidth / img.naturalHeight,
                          );
                        }
                      }}
                    />
                  ) : null}
                  {/* Filename caption, absolutely positioned below the tile so
                      it never affects the grid layout (nothing jumps); revealed
                      on hover via the tile's `group`. */}
                  <span
                    className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap bg-white px-2 py-1 text-sm text-black opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      fontFamily:
                        '"Graphik-Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
                      // Graphik-Black is a single-weight face registered at 400;
                      // keep the weight normal so the browser doesn't
                      // synthetically bold it.
                      fontWeight: 400,
                    }}
                  >
                    {`KM_${fileNameOf(url)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No posts yet.</p>
        )}
      </main>

      {/* Hover preview: the full image, placed where the cursor entered the tile.
          Non-interactive so it never steals the mouse from the tiles beneath.
          A plain <img> at a FIXED 1080px width (not next/image, which doubles to
          ~1920px on retina) — plenty sharp for a hover glimpse and much faster
          for the optimizer to generate and transfer. */}
      {preview ? (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: preview.x,
            top: preview.y,
            width: preview.w,
            height: preview.h,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/_next/image?url=${encodeURIComponent(preview.url)}&w=1080&q=75`}
            alt={preview.alt}
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
