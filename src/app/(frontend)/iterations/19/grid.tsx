"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type PostListItem = {
  id: string | number;
  title: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

// Preview sizing model (still measured in 12ths of the grid width, so the hover
// preview keeps the "5 columns landscape / 3 portrait" proportions).
const COLS = 12;
const GAP = 80; // px, matches the reference column gutter
const LANDSCAPE_SPAN = 5; // columns wide when the image is landscape
const PORTRAIT_SPAN = 3; // columns wide when the image is portrait
const CURSOR_OFFSET = 24; // px between the cursor and the preview
const EDGE_MARGIN = 16; // px the preview keeps from the viewport edge
// How far outside the viewport a tile starts loading, so images are ready just
// before they scroll into view.
const PRELOAD_MARGIN = "300px 0px";
// Inline layout: small thumbnails paired with an always-visible caption.
const CAPTION_PX = 30; // caption font size
const THUMB_PX = 70; // inline thumbnail size

// Filename caption, matching the labels used in the intro scene.
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
      sizes="80px"
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

// The landing-page grid, rendered as an inline flow of caption-then-image pairs.
// Each pair (and the pairs themselves) sit inline and wrap; captions are always
// visible in the regular font. Thumbnails lazy-load via an IntersectionObserver
// and hovering a pair still pops the full image up big.
export default function Grid({ posts }: { posts: PostListItem[] | null }) {
  const gridRef = useRef<HTMLUListElement>(null);
  // True aspect ratio (w/h) per image url, learned once each thumbnail loads —
  // the optimized image is EXIF-corrected, so this beats the stored dimensions.
  const ratios = useRef<Map<string, number>>(new Map());
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
  const previewAt = (clientX: number, url: string, alt: string): Preview => {
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

    // Horizontal position tracks the cursor's x (to the right of it, flipping to
    // the left near the edge); vertical position is always centered on screen.
    let x = clientX + CURSOR_OFFSET;
    if (x + w + EDGE_MARGIN > vw) x = clientX - CURSOR_OFFSET - w;
    x = Math.max(EDGE_MARGIN, Math.min(x, vw - w - EDGE_MARGIN));
    const y = (vh - h) / 2;

    return { url, alt, x, y, w, h };
  };

  const slides = (posts ?? []).filter((p) => p.imageUrl);

  return (
    <div className="relative flex flex-1 flex-col bg-zinc-50 font-sans">
      <main className="flex w-full flex-1 flex-col px-5 pt-5">
        {slides.length > 0 ? (
          <ul
            ref={gridRef}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-4"
          >
            {slides.map((post) => {
              const id = String(post.id);
              const url = post.imageUrl!;
              const alt = post.imageAlt ?? post.title;
              return (
                <li
                  key={id}
                  ref={setTileRef}
                  data-id={id}
                  className="inline-flex cursor-pointer items-start gap-[15px] bg-zinc-200"
                  onMouseEnter={(e) =>
                    setPreview(previewAt(e.clientX, url, alt))
                  }
                  onMouseLeave={() => setPreview(null)}
                >
                  {/* Small thumbnail first, lazy-loaded once the pair nears the
                      viewport. */}
                  <span
                    className="relative block shrink-0 overflow-hidden"
                    style={{ width: THUMB_PX, height: THUMB_PX }}
                  >
                    {visible.has(id) ? (
                      <Thumb
                        url={url}
                        alt={alt}
                        onReady={(img) => {
                          if (img.naturalWidth && img.naturalHeight) {
                            ratios.current.set(
                              url,
                              img.naturalWidth / img.naturalHeight,
                            );
                          }
                        }}
                      />
                    ) : null}
                  </span>

                  {/* Caption, always visible, in the regular font. */}
                  <span
                    className="whitespace-nowrap text-black"
                    style={{
                      fontFamily:
                        '"Graphik-Regular", "Helvetica Neue", Helvetica, Arial, sans-serif',
                      fontSize: CAPTION_PX,
                      lineHeight: 1,
                      paddingLeft: 10,
                      paddingTop: 5,
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
          Non-interactive so it never steals the mouse from the tiles beneath. */}
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
          <Image
            src={preview.url}
            alt={preview.alt}
            fill
            sizes="50vw"
            className="object-contain"
            priority
          />
        </div>
      ) : null}
    </div>
  );
}
