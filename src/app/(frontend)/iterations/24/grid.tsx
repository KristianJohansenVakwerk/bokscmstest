"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

// The hover preview is always the SAME height regardless of the image's aspect
// ratio — only its width varies. Height is this share of the viewport height.
const PREVIEW_HEIGHT_FRACTION = 0.6;
const CURSOR_OFFSET = 24; // px between the cursor and the preview
const EDGE_MARGIN = 16; // px the preview keeps from the viewport edge
// How far outside the viewport a tile starts loading, so images are ready just
// before they scroll into view.
const PRELOAD_MARGIN = "300px 0px";

// Idle auto-loop (intro only): after this long without mouse movement, cycle the
// big preview through every image, advancing one every LOOP_STEP_MS.
const IDLE_MS = 2000;
// How long each slide is held ON SCREEN once it has actually painted, before the
// loop advances. Timed from the image's load event (not a blind interval), so a
// slow-loading image is still shown in full and the cadence stays constant.
const LOOP_STEP_MS = 1050;
// Safety cap: if a slide's load event never reaches the loop (decode error or a
// missing tile), advance anyway after this rather than stalling on one image.
const MAX_LOAD_MS = 4000;

// Candidate widths for the big preview's srcSet — a subset of Next's default
// deviceSizes (only those values are accepted by the /_next/image optimizer).
const PREVIEW_SRC_WIDTHS = [640, 750, 828, 1080, 1200, 1920];

// The width the preview's <img> will actually request for a box `boxW` CSS px
// wide: the smallest srcSet candidate at least as large as the box × DPR, which
// mirrors how the browser resolves srcSet/sizes. The idle loop uses this to
// preload the EXACT resource the next slide needs, so it's cached before the
// loop advances to it (no backdrop flash on the hand-off).
function previewWidthFor(boxW: number) {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const need = boxW * dpr;
  return (
    PREVIEW_SRC_WIDTHS.find((w) => w >= need) ??
    PREVIEW_SRC_WIDTHS[PREVIEW_SRC_WIDTHS.length - 1]
  );
}

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
  // The tile's background colour, painted behind the preview as a backdrop fill
  // while the full-size image is still loading.
  bg: string | null;
};

// The big hover image. Its box is painted with the tile's backdrop colour so a
// solid fill shows immediately; the image then fades in over it once decoded.
// In the grid it's tappable to dismiss on mobile (pointer-events-auto + onClick);
// on desktop it stays click-through so hover works. During the intro
// (`interactive` false) it's always click-through so taps fall through to enter
// the grid rather than dismissing the preview.
function PreviewImage({
  preview,
  interactive,
  onDismiss,
  onLoaded,
}: {
  preview: Preview;
  interactive: boolean;
  onDismiss: () => void;
  // Fires (with the image url) the moment the full-size image paints — or errors
  // — so the idle loop can wait for the current slide before advancing.
  onLoaded?: (url: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={`fixed z-50 sm:pointer-events-none ${
        interactive ? "pointer-events-auto" : "pointer-events-none"
      }`}
      onClick={onDismiss}
      style={{
        left: preview.x,
        top: preview.y,
        width: preview.w,
        height: preview.h,
        backgroundColor: preview.bg ?? "#f4f4f5",
      }}
    >
      {/* Responsive: a srcSet across Next's allowed widths plus `sizes` set to the
          preview's actual rendered width lets the browser fetch only what the box
          needs (× DPR) instead of a fixed 1080 on every device — much lighter on
          mobile, where the preview box is small. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/_next/image?url=${encodeURIComponent(preview.url)}&w=1080&q=75`}
        srcSet={PREVIEW_SRC_WIDTHS.map(
          (w) =>
            `/_next/image?url=${encodeURIComponent(preview.url)}&w=${w}&q=75 ${w}w`,
        ).join(", ")}
        sizes={`${Math.round(preview.w)}px`}
        alt={preview.alt}
        fetchPriority="high"
        onLoad={() => {
          setLoaded(true);
          onLoaded?.(preview.url);
        }}
        // Treat a failed load as "ready" too, so the loop never stalls on it.
        onError={() => onLoaded?.(preview.url)}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ease-out ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

// A lazy-loaded thumbnail that fades in once its image decodes. Reports the
// loaded element so the parent can record the true aspect ratio. When `hidden`
// (during the wordmark intro) it stays mounted and keeps loading — so the hover
// preview still learns the ratio — but renders transparent.
function Thumb({
  url,
  alt,
  hidden,
  onReady,
}: {
  url: string;
  alt: string;
  hidden: boolean;
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
        loaded && !hidden ? "opacity-100" : "opacity-0"
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
export default function Grid({
  posts,
  hideThumbs = false,
}: {
  posts: PostListItem[] | null;
  // When true (the wordmark intro), tiles hide the photo but keep their backdrop
  // fill colour, and stay hoverable so the big preview still works.
  hideThumbs?: boolean;
}) {
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
  // Horizontal nudge (px) applied to the hovered tile's caption so it never
  // spills past the viewport edge — captions are centered under their tile, and
  // the outermost tiles in a row would otherwise clip against the screen edge.
  const [captionShift, setCaptionShift] = useState<{
    id: string;
    dx: number;
  } | null>(null);

  // How far the caption for a tile must shift to stay fully on screen. The
  // caption is centered on the tile, so its box spans [center-w/2, center+w/2];
  // pull it right if it clips the left edge, left if it clips the right edge.
  const captionShiftFor = (tileRect: DOMRect, url: string) => {
    const capW = captionWidth(`KM_${fileNameOf(url)}`);
    const center = tileRect.left + tileRect.width / 2;
    const left = center - capW / 2;
    const right = center + capW / 2;
    if (left < EDGE_MARGIN) return EDGE_MARGIN - left;
    if (right > window.innerWidth - EDGE_MARGIN)
      return window.innerWidth - EDGE_MARGIN - right;
    return 0;
  };

  // Lazy-load state: the set of tile ids that have scrolled near the viewport.
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const tilesRef = useRef<Set<Element>>(new Set());
  // Tile elements by id, so the idle auto-loop can locate each tile in order.
  const tileEls = useRef<Map<string, HTMLLIElement>>(new Map());
  // Index of the last tile shown (by hover or by the loop) so the idle loop
  // resumes from where the user left off rather than restarting at the top-left.
  const lastIndexRef = useRef(0);
  // When the preview was last opened. On touch, tapping a tile opens the preview
  // and the same tap's trailing click can land on the (now on-screen, tappable)
  // preview and dismiss it instantly — a flicker. We ignore dismiss clicks that
  // arrive within this window of opening so only a deliberate second tap closes.
  const openedAtRef = useRef(0);
  const OPEN_GUARD_MS = 400;
  const dismissPreview = () => {
    if (Date.now() - openedAtRef.current < OPEN_GUARD_MS) return;
    setPreview(null);
  };

  // Bridges the big preview's load event back to the idle loop: while looping,
  // the effect parks a resolver here and PreviewImage calls it once the current
  // image has painted, so the loop advances only after each slide is on screen.
  // Null (and a no-op) whenever the loop isn't running, e.g. during hover.
  const previewLoadedRef = useRef<((url: string) => void) | null>(null);
  const handlePreviewLoaded = useCallback((url: string) => {
    previewLoadedRef.current?.(url);
  }, []);

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
    const id = el.getAttribute("data-id");
    if (id) tileEls.current.set(id, el);
    observerRef.current?.observe(el);
  }, []);

  // Place a preview on the side of the cursor dictated by its screen half (left
  // half → right of cursor, right half → left), vertically centered, at a fixed
  // height. It flips to the other side only as a fallback (caption in the way or
  // it would run off the far edge), then clamps fully within the viewport.
  const previewAt = (
    clientX: number,
    tileRect: DOMRect,
    url: string,
    alt: string,
    bg: string | null,
  ): Preview => {
    const ratio = ratios.current.get(url) ?? 1.4; // assume landscape until known
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Every preview is the SAME height regardless of the image's ratio; only the
    // width varies to keep the aspect correct. Height is a fixed share of the
    // viewport, capped so it never touches the top/bottom edges. As a safety net
    // for extreme panoramas, shrink the height if the width would overflow.
    let h = Math.min(vh * PREVIEW_HEIGHT_FRACTION, vh - 2 * EDGE_MARGIN);
    let w = h * ratio;
    const maxW = vw - 2 * EDGE_MARGIN;
    if (w > maxW) {
      h *= maxW / w;
      w = maxW;
    }

    // The caption's on-screen box (mirrors the tile's caption span): centered
    // under the tile, one small line tall, a little below its bottom edge.
    const capW = captionWidth(`KM_${fileNameOf(url)}`);
    const capCenterX = tileRect.left + tileRect.width / 2;
    const capL = capCenterX - capW / 2;
    const capR = capCenterX + capW / 2;
    const capTop = tileRect.bottom + CAPTION_GAP;
    const capBottom = capTop + CAPTION_HEIGHT;

    // Which side the preview sits on is decided by the cursor's screen half:
    // cursor in the LEFT half → preview to the RIGHT of it; RIGHT half → to the
    // LEFT. It only flips to the other side as a fallback (no room by the
    // caption, or it would run off the far edge). Vertically it's centered.
    const onLeftHalf = clientX < vw / 2;
    const plainRight = clientX + CURSOR_OFFSET;
    const plainLeft = clientX - CURSOR_OFFSET - w;
    // Caption-aware variants of each side, nudged clear of the label's box.
    const capAwareRight = Math.max(plainRight, capR + CAPTION_CLEARANCE);
    const capAwareLeft = Math.min(plainLeft, capL - CAPTION_CLEARANCE - w);

    let x = onLeftHalf ? plainRight : plainLeft;
    let y = (vh - h) / 2;

    // When the preview's vertical span would cross the caption's row, sit it
    // clear of the label HORIZONTALLY: preferred side if it fits, else flip to
    // the other side. If the image is too wide to clear the caption on either
    // side, leave it on the preferred side, vertically centered — the caption
    // is raised above the preview (z-index) so it stays legible over it. We no
    // longer drop the image above/below the caption, which snapped it to a
    // viewport corner for tiles high or low on screen. Skipped during the
    // intro, where no caption is rendered, so the preview stays centered.
    if (!hideThumbs && y < capBottom && y + h > capTop) {
      const preferX = onLeftHalf ? capAwareRight : capAwareLeft;
      const otherX = onLeftHalf ? capAwareLeft : capAwareRight;
      const fitsOnScreen = (candidate: number) =>
        candidate >= EDGE_MARGIN && candidate + w + EDGE_MARGIN <= vw;
      if (fitsOnScreen(preferX)) {
        x = preferX;
      } else if (fitsOnScreen(otherX)) {
        x = otherX;
      }
    } else if (onLeftHalf && x + w + EDGE_MARGIN > vw) {
      x = plainLeft; // preferred right side overflows → flip left
    } else if (!onLeftHalf && x < EDGE_MARGIN) {
      x = plainRight; // preferred left side overflows → flip right
    }

    x = Math.max(EDGE_MARGIN, Math.min(x, vw - w - EDGE_MARGIN));
    y = Math.max(EDGE_MARGIN, Math.min(y, vh - h - EDGE_MARGIN));

    return { url, alt, x, y, w, h, bg };
  };

  // Memoized so the idle-loop effect below keeps a stable dependency (a fresh
  // array each render would restart the timers every time the preview changes).
  const slides = useMemo(
    () => (posts ?? []).filter((p) => p.imageUrl),
    [posts],
  );

  // Idle auto-loop (intro only): after 5s without mouse movement, cycle the big
  // preview through every image in order — top-left (first) first — until the
  // user moves the mouse again, at which point hover takes back over.
  useEffect(() => {
    if (!hideThumbs || slides.length === 0) return;

    let idle: number | undefined;
    let hold: number | undefined;
    let fallback: number | undefined;
    let looping = false;

    const showAt = (i: number) => {
      const post = slides[i];
      const el = post && tileEls.current.get(String(post.id));
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPreview(
        previewAt(
          rect.left + rect.width / 2,
          rect,
          post.imageUrl!,
          post.imageAlt ?? post.title,
          post.backgroundColor,
        ),
      );
    };

    // Warm the browser cache for slide `i`'s preview — the exact width the <img>
    // will pick — so when the loop advances to it, it paints from cache almost
    // immediately instead of flashing the backdrop fill on the hand-off.
    const preload = (i: number) => {
      const post = slides[i];
      const el = post && tileEls.current.get(String(post.id));
      if (!el || !post.imageUrl) return;
      const rect = el.getBoundingClientRect();
      const box = previewAt(
        rect.left + rect.width / 2,
        rect,
        post.imageUrl,
        post.imageAlt ?? post.title,
        post.backgroundColor,
      );
      const w = previewWidthFor(box.w);
      const img = new window.Image();
      img.src = `/_next/image?url=${encodeURIComponent(post.imageUrl)}&w=${w}&q=75`;
    };

    const clearStep = () => {
      if (hold) window.clearTimeout(hold);
      if (fallback) window.clearTimeout(fallback);
      hold = undefined;
      fallback = undefined;
      previewLoadedRef.current = null;
    };

    const stop = () => {
      clearStep();
      looping = false;
    };

    // Show slide `index`, then advance to the next only once THIS image has
    // painted — holding it on screen for LOOP_STEP_MS after it appears. The
    // cadence is measured from when the image is actually visible (constant, no
    // flicker), not from a blind interval that races the network and leaves the
    // backdrop showing. The next slide is preloaded during the hold so it's
    // ready the instant we advance.
    const step = (index: number) => {
      if (!looping) return;
      lastIndexRef.current = index;
      showAt(index);
      preload((index + 1) % slides.length);

      const url = slides[index].imageUrl!;
      const goNext = () => {
        clearStep();
        step((index + 1) % slides.length);
      };
      // Park a resolver the current preview calls once it paints; then hold the
      // image for the step before advancing.
      previewLoadedRef.current = (loadedUrl) => {
        if (loadedUrl !== url) return;
        previewLoadedRef.current = null;
        hold = window.setTimeout(goNext, LOOP_STEP_MS);
      };
      // Never stall if the load event doesn't arrive (error, or a cache hit that
      // fired before the resolver was parked).
      fallback = window.setTimeout(goNext, MAX_LOAD_MS + LOOP_STEP_MS);
    };

    const start = () => {
      looping = true;
      // Resume from the last tile the user hovered (or where the loop stopped),
      // defaulting to the top-left on first run.
      step(lastIndexRef.current % slides.length);
    };

    const arm = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(start, IDLE_MS);
    };

    const onMove = () => {
      if (looping) {
        stop();
        setPreview(null); // hand back to hover the instant the user moves
      }
      arm();
    };

    window.addEventListener("mousemove", onMove);
    arm(); // no movement yet — start the idle countdown right away
    // Warm the first slide during the idle countdown so even it shows promptly.
    preload(lastIndexRef.current % slides.length);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.clearTimeout(idle);
      stop();
      setPreview(null);
    };
    // previewAt/setPreview are stable for this intro-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideThumbs, slides]);

  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip bg-[#f3f3f3] font-sans">
      <main className="flex w-full flex-1 flex-col px-5 pb-5 pt-14">
        {slides.length > 0 ? (
          <ul className="flex flex-wrap items-center justify-center gap-20">
            {slides.map((post, index) => {
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
                  className="group relative h-[69px] shrink-0 cursor-zoom-in"
                  style={{
                    aspectRatio: aspect,
                    // During the intro every tile stays blank — only the big
                    // preview shows, nothing appears in the grid itself. Outside
                    // the intro tiles keep their backdrop colour as usual.
                    backgroundColor: hideThumbs
                      ? undefined
                      : (post.backgroundColor ?? undefined),
                  }}
                  onPointerEnter={(e) => {
                    // Hover-to-open is MOUSE ONLY. On touch a tap synthesizes a
                    // pointerenter too, which would open the preview and then let
                    // the same tap's click land on it and dismiss it — the flicker.
                    // Touch/pen open via onClick instead.
                    if (e.pointerType !== "mouse") return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPreview(
                      previewAt(
                        e.clientX,
                        rect,
                        url,
                        alt,
                        post.backgroundColor,
                      ),
                    );
                    setCaptionShift({ id, dx: captionShiftFor(rect, url) });
                    // Remember this tile so the idle loop resumes from here.
                    lastIndexRef.current = index;
                    openedAtRef.current = Date.now();
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== "mouse") return;
                    setPreview(null);
                    setCaptionShift(null);
                  }}
                  onClick={(e) => {
                    // During the intro let the click bubble to the wrapper (which
                    // enters the grid). In the grid, tapping a tile shows its big
                    // preview — this is how mobile (no hover) opens an image.
                    if (hideThumbs) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPreview(
                      previewAt(
                        e.clientX,
                        rect,
                        url,
                        alt,
                        post.backgroundColor,
                      ),
                    );
                    setCaptionShift({ id, dx: captionShiftFor(rect, url) });
                    lastIndexRef.current = index;
                    openedAtRef.current = Date.now();
                  }}
                >
                  {/* Only mount the image once the tile nears the viewport, so
                      off-screen thumbnails are never requested; it fades in on
                      load. */}
                  {visible.has(id) ? (
                    <Thumb
                      url={url}
                      alt={alt}
                      hidden={hideThumbs}
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
                      on hover via the tile's `group`. Suppressed during the intro
                      so only the wordmark and the big preview show. Desktop only —
                      on mobile the caption sits under the big preview instead. */}
                  {hideThumbs ? null : (
                    <span
                      className="pointer-events-none absolute left-1/2 top-full z-[55] mt-2 hidden whitespace-nowrap px-2 py-1 text-sm text-black opacity-0 transition-opacity group-hover:opacity-100 sm:block"
                      style={{
                        fontFamily:
                          '"Graphik-Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
                        // Graphik-Black is a single-weight face registered at 400;
                        // keep the weight normal so the browser doesn't
                        // synthetically bold it.
                        fontWeight: 400,
                        // Center under the tile (-50%), plus the viewport-clamp
                        // nudge for the currently hovered tile.
                        transform: `translateX(calc(-50% + ${
                          captionShift?.id === id ? captionShift.dx : 0
                        }px))`,
                      }}
                    >
                      {`KM_${fileNameOf(url)}`}
                    </span>
                  )}
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
          for the optimizer to generate and transfer. Keyed by url so its
          load/fade state resets for each new image. */}
      {preview ? (
        <PreviewImage
          key={preview.url}
          preview={preview}
          interactive={!hideThumbs}
          onDismiss={dismissPreview}
          onLoaded={handlePreviewLoaded}
        />
      ) : null}

      {/* Mobile caption: sits centered under the big preview image (rather than
          under the tiny grid tile). Mobile only; hidden during the intro. */}
      {preview && !hideThumbs ? (
        <div
          className="pointer-events-none fixed z-[55] flex justify-center sm:hidden"
          style={{
            left: preview.x,
            top: preview.y + preview.h + CAPTION_GAP,
            width: preview.w,
          }}
        >
          <span
            className="whitespace-nowrap px-2 py-1 text-sm text-black"
            style={{
              fontFamily:
                '"Graphik-Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
              fontWeight: 400,
            }}
          >
            {`KM_${fileNameOf(preview.url)}`}
          </span>
        </div>
      ) : null}
    </div>
  );
}
