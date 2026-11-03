"use client";

import { useEffect, useState } from "react";

import { useView } from "../../view-context";
import Grid, { type PostListItem } from "../../_home/grid";
import IntroScene, { type SceneImage } from "./scene";

const INTRO_FADE_MS = 700;
const CONTACT_FADE_MS = 180;

// Iteration 25: the final homepage, but the intro wordmark is drawn inside the
// three.js scene by a shader that warps it with the photos behind it (see
// scene.tsx). Otherwise the same as /:
//   intro   — iteration 14's three.js scene (five images fly in, clicking swaps
//             them)
//   index   — iteration 24's thumbnail grid with the big hover preview
//   contact — iteration 24's contact card over the grid
// The intro is left via the nav dropdown. The grid stays mounted beneath the
// intro the whole time, so it's already loaded when the intro fades away.
export default function IterationTwentyFiveHome({
  posts,
  images,
}: {
  posts: PostListItem[] | null;
  images: SceneImage[];
}) {
  const { mode } = useView();

  // The intro covers everything while mode is "intro" and fades out once the
  // nav picks another view; it unmounts after the fade so the WebGL scene stops.
  const [introMounted, setIntroMounted] = useState(true);
  useEffect(() => {
    if (mode === "intro") return;
    const t = window.setTimeout(() => setIntroMounted(false), INTRO_FADE_MS);
    return () => window.clearTimeout(t);
  }, [mode]);

  // Fade the contact card in AND out. `contactMounted` keeps it in the tree
  // through the fade-out; `contactShown` drives the opacity. On entry: mount one
  // frame, flip to shown the next so the transition runs. On exit: hide, then
  // unmount once the fade has finished.
  const [contactMounted, setContactMounted] = useState(false);
  const [contactShown, setContactShown] = useState(false);
  useEffect(() => {
    if (mode === "contact") {
      let raf = requestAnimationFrame(() => {
        setContactMounted(true);
        raf = requestAnimationFrame(() => setContactShown(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    const hide = requestAnimationFrame(() => setContactShown(false));
    const t = window.setTimeout(() => setContactMounted(false), CONTACT_FADE_MS);
    return () => {
      cancelAnimationFrame(hide);
      window.clearTimeout(t);
    };
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

      {introMounted ? (
        // Full-viewport intro over the grid and contact card (z-40), under the
        // nav (z-50). Stops taking clicks as soon as it starts fading out.
        <div
          className={`fixed inset-0 z-[45] transition-opacity ease-out ${
            mode === "intro" ? "" : "pointer-events-none"
          }`}
          style={{
            opacity: mode === "intro" ? 1 : 0,
            transitionDuration: `${INTRO_FADE_MS}ms`,
          }}
        >
          <IntroScene images={images} />
        </div>
      ) : null}
    </div>
  );
}
