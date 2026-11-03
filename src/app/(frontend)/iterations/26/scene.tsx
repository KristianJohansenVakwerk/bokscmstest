"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";

export type SceneImage = {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
};

// Iteration 26: like 25, but the wordmark stays solid black and behaves like
// jelly — letters reach for images that come near, stick to them and get dragged
// along, then tear loose and wobble back to their original shape.

// Layout constants. The stage is a 12-column grid whose full width fills the
// viewport; column spans decide how wide each image sits.
const COLS = 12;
const COUNT = 5; // images shown at once
const FIT_MARGIN = 1.0; // 12 columns span the viewport width exactly
const FOV = 55;

// Live-tunable settings, shown in a lil-gui panel (top right). Jelly values are
// in world units per 60 Hz step; one css px is ~0.008 world units at 1440px.
const DEFAULTS = {
  ease: 0.09, // fly-in / fly-out tween speed
  titleScale: 0.5, // wordmark width as a share of the full-width (100vw - 60px)
  reach: 0.45, // how far a letter reaches for an image edge (~55px)
  maxStretch: 1.1, // tears loose beyond this (~130px)
  rearm: 0.25, // a torn vertex can stick again once back within this
  spring: 0.035, // pull back to the original shape
  cohesion: 0.18, // neighbours drag each other along, like jelly
  pull: 0.05, // attraction toward the nearest image edge
  stick: 0.25, // how strongly touching vertices ride along
  damp: 0.9, // < 1; lower settles faster, higher wobbles longer
};
type Settings = typeof DEFAULTS;
// Tweaks are remembered per browser so they survive reloads while tuning.
const STORAGE_KEY = "iteration-26-jelly";

function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode etc.) — tweaks just won't persist */
  }
}

// Downscaled, same-origin texture URL via Next's image optimizer. NOTE: w and q
// must be values the optimizer allows (deviceSizes/imageSizes + qualities), else
// it returns 400 — here w=640 and q=75 are both valid.
function textureUrl(src: string, w = 640, q = 75) {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
}

function pick<T>(a: T, b: T): T {
  return Math.random() < 0.5 ? a : b;
}

export default function Scene({ images }: { images: SceneImage[] }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || images.length === 0) return;

    const settings = loadSettings();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // white, to match the site

    const camera = new THREE.PerspectiveCamera(
      FOV,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // World geometry: 12 columns span WALL_WIDTH; the camera is pulled back so
    // that width fills the viewport (recomputed on resize as aspect changes).
    const WALL_WIDTH = 12;
    const colWidth = WALL_WIDTH / COLS;
    const vFov = (FOV * Math.PI) / 180;

    const fitCamera = () => {
      const dist =
        (WALL_WIDTH * FIT_MARGIN) / (2 * Math.tan(vFov / 2) * camera.aspect);
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);
    };
    fitCamera();

    const visibleHeight = () => 2 * camera.position.z * Math.tan(vFov / 2);

    // Shared unit plane, scaled per tile. Textures are cached by URL so repeated
    // random picks reuse the same GPU texture.
    const geometry = new THREE.PlaneGeometry(1, 1);
    const texCache = new Map<string, THREE.Texture>();
    const loader = new THREE.TextureLoader();
    let cancelled = false;

    const applyTexture = (url: string, material: THREE.MeshBasicMaterial) => {
      const cached = texCache.get(url);
      if (cached) {
        material.map = cached;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        return;
      }
      loader.load(textureUrl(url), (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texCache.set(url, texture);
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
      });
    };

    // The stored width/height can be wrong for EXIF-rotated photos (the optimizer
    // auto-rotates, so the served image is turned 90°). Load each image once to
    // learn its TRUE aspect (served width / height) and cache both it and the
    // texture, so the layout uses the real orientation instead of squeezing.
    const aspectCache = new Map<string, number>();
    const loadAspect = (url: string): Promise<number> =>
      new Promise((resolve) => {
        const known = aspectCache.get(url);
        if (known) return resolve(known);
        loader.load(
          textureUrl(url),
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            const img = texture.image as { width: number; height: number };
            const aspect = img.width / img.height || 1;
            aspectCache.set(url, aspect);
            texCache.set(url, texture); // reused by applyTexture on spawn
            resolve(aspect);
          },
          undefined,
          () => resolve(1), // fall back to square if it fails to load
        );
      });

    // Images sit at a random depth either side of this plane, so they pass in
    // front of and behind each other.
    const TEXT_Z = 0;

    // The wordmark lives in its own scene, drawn after the images with depth
    // testing off so it's always on top. It's a finely subdivided plane whose
    // vertices run a small jelly simulation (see stepJelly): letters reach for
    // nearby images, stick to them and get dragged along, then tear loose once
    // stretched too far and wobble back to their original shape.
    const titleScene = new THREE.Scene();
    // Rasterized once at a fixed width that stays sharp on large retina screens.
    const TITLE_RASTER_W = 4096;
    const TITLE_SIDE_PX = 30; // css px each side, as iteration 24's 100vw - 60px
    // The logo's aspect comes from karl-logo.svg's viewBox. The canvas is sized
    // once up front: three.js allocates the GPU texture at its first upload, so
    // resizing the canvas later would overflow it.
    const titleAspect = 1804.858 / 187.795;
    const titleCanvas = document.createElement("canvas");
    titleCanvas.width = TITLE_RASTER_W;
    titleCanvas.height = Math.round(TITLE_RASTER_W / titleAspect);
    const titleTex = new THREE.CanvasTexture(titleCanvas);
    titleTex.colorSpace = THREE.SRGBColorSpace;
    titleTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Solid black letters: only the logo's alpha is used, not its colour.
    const titleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uLogo: { value: titleTex },
        uOpacity: { value: 0 }, // shown once the SVG has rasterized
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uLogo;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(uLogo, vUv).a * uOpacity);
        }
      `,
    });

    // Vertex grid across the wordmark. More columns than rows since it's ~10x
    // wider than tall; dense enough that individual letters can stretch.
    const SEG_X = 240;
    const SEG_Y = 24;
    const VX = SEG_X + 1;
    const VY = SEG_Y + 1;
    const vertexCount = VX * VY;
    let titleGeom = new THREE.PlaneGeometry(1, 1, SEG_X, SEG_Y);
    const titleMesh = new THREE.Mesh(titleGeom, titleMat);
    titleMesh.position.set(0, 0, TEXT_Z);
    titleMesh.frustumCulled = false; // vertices move outside the original bounds
    titleScene.add(titleMesh);

    // Per-vertex jelly state, in world units: rest position, displacement from
    // rest, velocity, and whether the vertex has torn loose (see stepJelly).
    const restX = new Float32Array(vertexCount);
    const restY = new Float32Array(vertexCount);
    const dispX = new Float32Array(vertexCount);
    const dispY = new Float32Array(vertexCount);
    const velX = new Float32Array(vertexCount);
    const velY = new Float32Array(vertexCount);
    const torn = new Uint8Array(vertexCount);

    // Rebuild the grid in world units for the current viewport (the visible
    // width at z=0 is exactly WALL_WIDTH, so one css pixel is
    // WALL_WIDTH/clientWidth world units), and reset the simulation.
    const sizeTitle = () => {
      const worldPerPx = WALL_WIDTH / mount.clientWidth;
      const w =
        Math.max(1, mount.clientWidth - 2 * TITLE_SIDE_PX) * settings.titleScale * worldPerPx;
      const h = w / titleAspect;
      titleGeom.dispose();
      titleGeom = new THREE.PlaneGeometry(w, h, SEG_X, SEG_Y);
      titleMesh.geometry = titleGeom;
      const pos = titleGeom.attributes.position;
      for (let i = 0; i < vertexCount; i++) {
        restX[i] = pos.getX(i);
        restY[i] = pos.getY(i);
      }
      dispX.fill(0);
      dispY.fill(0);
      velX.fill(0);
      velY.fill(0);
      torn.fill(0);
    };
    sizeTitle();

    const logo = new Image();
    logo.onload = () => {
      if (cancelled) return;
      const tctx = titleCanvas.getContext("2d")!;
      tctx.drawImage(logo, 0, 0, titleCanvas.width, titleCanvas.height);
      titleTex.needsUpdate = true;
      titleMat.uniforms.uOpacity.value = 1;
    };
    logo.src = "/karl-logo.svg";

    type Tile = {
      mesh: THREE.Mesh;
      material: THREE.MeshBasicMaterial;
      target: THREE.Vector3;
      targetOpacity: number;
      exiting: boolean;
      // Last frame's on-screen rect centre (projected to z=0), so the jelly can
      // follow the image's motion.
      prevX: number;
      prevY: number;
    };
    let tiles: Tile[] = [];

    // Pick COUNT distinct random images from the pool.
    const pickImages = (): SceneImage[] => {
      if (images.length <= COUNT) return images.slice();
      const pool = images.slice();
      const out: SceneImage[] = [];
      for (let i = 0; i < COUNT && pool.length; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(idx, 1)[0]);
      }
      return out;
    };

    type Placement = { img: SceneImage; x: number; y: number; w: number; h: number };

    // Non-overlapping layout: portraits span 1 or 3 columns, landscapes 3 or 5,
    // height from the natural ratio. Each image is placed by rejection sampling
    // that REQUIRES zero overlap. x is column-snapped so it stays within the
    // viewport width; y is sampled from a range that grows whenever a spot can't
    // be found, letting images bleed above/below the viewport — the only allowed
    // kind of "overlap". A deterministic stack-below fallback guarantees success.
    const PAD = 0.15; // enforced gap between tiles, in world units
    const TILE_SCALE = 0.8; // shrink both portrait and landscape tiles 20%
    const overlaps = (
      x: number,
      y: number,
      w: number,
      h: number,
      p: Placement,
    ) =>
      (w + p.w) / 2 + PAD - Math.abs(x - p.x) > 0 &&
      (h + p.h) / 2 + PAD - Math.abs(y - p.y) > 0;

    const makeLayout = (
      selected: { img: SceneImage; aspect: number }[],
    ): Placement[] => {
      const visH = visibleHeight();
      const placed: Placement[] = [];
      for (const { img, aspect } of selected) {
        const portrait = aspect < 1;
        const span = portrait ? pick(1, 3) : pick(3, 5);
        const w = span * colWidth * TILE_SCALE;
        const h = w / aspect; // real aspect = width / height

        // Vertical sampling range; expands if we can't find a free spot, so
        // there's always room to stack without overlapping.
        let yRange = Math.max(visH / 2, h);
        let spot: Placement | null = null;
        for (let attempt = 0; attempt < 300 && !spot; attempt++) {
          const startCol = Math.floor(Math.random() * (COLS - span + 1));
          const x = -WALL_WIDTH / 2 + (startCol + span / 2) * colWidth;
          const y = (Math.random() * 2 - 1) * yRange;
          if (!placed.some((p) => overlaps(x, y, w, h, p))) {
            spot = { img, x, y, w, h };
          } else if (attempt % 50 === 49) {
            yRange += h; // give the search more vertical room to work with
          }
        }

        // Guaranteed fallback: drop it just below everything placed so far.
        if (!spot) {
          const lowest = placed.reduce(
            (min, p) => Math.min(min, p.y - p.h / 2),
            visH / 2,
          );
          const startCol = Math.floor(Math.random() * (COLS - span + 1));
          const x = -WALL_WIDTH / 2 + (startCol + span / 2) * colWidth;
          spot = { img, x, y: lowest - h / 2 - PAD, w, h };
        }
        placed.push(spot);
      }
      return placed;
    };

    // A point well off screen, in a random direction from (x, y) — used as both
    // the fly-in start and the fly-out destination.
    const offscreenFrom = (x: number, y: number) => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.max(WALL_WIDTH, visibleHeight()) * 1.25;
      return new THREE.Vector3(x + Math.cos(a) * r, y + Math.sin(a) * r, 0);
    };

    const spawn = (p: Placement) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0xe4e4e7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      // Random layer: half the images sit in front of TEXT_Z, half behind.
      // A little jitter keeps images within a band from z-fighting each other.
      const front = Math.random() < 0.5;
      const z = TEXT_Z + (front ? 1 : -1) * (0.2 + Math.random() * 0.5);
      mesh.scale.set(p.w, p.h, 1);
      const start = offscreenFrom(p.x, p.y);
      start.z = z;
      mesh.position.copy(start);
      scene.add(mesh);
      applyTexture(p.img.url, material);

      tiles.push({
        mesh,
        material,
        target: new THREE.Vector3(p.x, p.y, z),
        targetOpacity: 1,
        exiting: false,
        prevX: start.x,
        prevY: start.y,
      });
    };

    const spawnLayout = async () => {
      const picked = pickImages();
      // Learn each image's true (EXIF-corrected) aspect before laying out.
      const aspects = await Promise.all(picked.map((img) => loadAspect(img.url)));
      if (cancelled) return;
      const sized = picked.map((img, i) => ({ img, aspect: aspects[i] }));
      for (const p of makeLayout(sized)) spawn(p);
    };

    // Fling the current tiles out, then fly a fresh random layout in.
    const swap = () => {
      for (const t of tiles) {
        if (t.exiting) continue;
        const out = offscreenFrom(t.mesh.position.x, t.mesh.position.y);
        out.z = t.mesh.position.z;
        t.target.copy(out);
        t.targetOpacity = 0;
        t.exiting = true;
      }
      void spawnLayout();
    };

    void spawnLayout();

    const onClick = () => swap();
    mount.addEventListener("click", onClick);

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      fitCamera();
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      sizeTitle();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    // Each tile's on-screen rect at the wordmark's depth. Images sit at their own
    // z, so perspective makes them look bigger/smaller and shifted; projecting to
    // z=0 makes contact line up with what you see.
    type Rect = { minX: number; maxX: number; minY: number; maxY: number; vx: number; vy: number };
    // `steps` spreads the motion since the last call over that many sim steps.
    const tileRects = (steps: number): Rect[] => {
      const camZ = camera.position.z;
      return tiles.map((t) => {
        const f = camZ / (camZ - t.mesh.position.z);
        const cx = t.mesh.position.x * f;
        const cy = t.mesh.position.y * f;
        const hw = (t.mesh.scale.x * f) / 2;
        const hh = (t.mesh.scale.y * f) / 2;
        const rect = {
          minX: cx - hw,
          maxX: cx + hw,
          minY: cy - hh,
          maxY: cy + hh,
          vx: (cx - t.prevX) / steps,
          vy: (cy - t.prevY) / steps,
        };
        t.prevX = cx;
        t.prevY = cy;
        return rect;
      });
    };

    // The jelly settings are per 60 Hz step, so run a fixed 60 steps per second
    // whatever the display's refresh rate (capped, so a background tab coming
    // back doesn't fast-forward).
    const STEP_MS = 1000 / 60;
    let lastTime = performance.now();
    let pending = 0;

    const stepJelly = () => {
      const now = performance.now();
      pending = Math.min(pending + (now - lastTime), STEP_MS * 4);
      lastTime = now;
      const steps = Math.floor(pending / STEP_MS);
      if (steps === 0) return;
      pending -= steps * STEP_MS;

      const rects = tileRects(steps);
      for (let step = 0; step < steps; step++) simulate(rects);

      const pos = titleGeom.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < vertexCount; k++) {
        pos.setXY(k, restX[k] + dispX[k], restY[k] + dispY[k]);
      }
      pos.needsUpdate = true;
    };

    const simulate = (rects: Rect[]) => {
      const { reach, maxStretch, rearm, spring, cohesion, pull, stick, damp } =
        settings;
      for (let j = 0; j < VY; j++) {
        for (let i = 0; i < VX; i++) {
          const k = j * VX + i;
          const dx = dispX[k];
          const dy = dispY[k];

          // Spring back toward the original shape.
          let fx = -spring * dx;
          let fy = -spring * dy;

          // Cohesion: ease toward the neighbours' average displacement so the
          // letters stretch as one gooey mass instead of individual points.
          let sx = 0;
          let sy = 0;
          let n = 0;
          if (i > 0) { sx += dispX[k - 1]; sy += dispY[k - 1]; n++; }
          if (i < VX - 1) { sx += dispX[k + 1]; sy += dispY[k + 1]; n++; }
          if (j > 0) { sx += dispX[k - VX]; sy += dispY[k - VX]; n++; }
          if (j < VY - 1) { sx += dispX[k + VX]; sy += dispY[k + VX]; n++; }
          fx += cohesion * (sx / n - dx);
          fy += cohesion * (sy / n - dy);

          // Stretched too far: tear loose and wobble home; stick again only
          // once it's mostly back, so it doesn't chatter at the limit.
          const stretch = Math.hypot(dx, dy);
          if (stretch > maxStretch) torn[k] = 1;
          else if (torn[k] && stretch < rearm) torn[k] = 0;

          if (!torn[k]) {
            const px = restX[k] + dx;
            const py = restY[k] + dy;
            for (const r of rects) {
              // Nearest point on the image's rect (the point itself if inside).
              const qx = Math.min(Math.max(px, r.minX), r.maxX);
              const qy = Math.min(Math.max(py, r.minY), r.maxY);
              const ex = qx - px;
              const ey = qy - py;
              const dist = Math.hypot(ex, ey);
              if (dist >= reach) continue;
              const s = (1 - dist / reach) ** 2;
              // Reach for the edge, and ride along with the image's motion.
              fx += pull * s * ex + stick * s * (r.vx - velX[k]);
              fy += pull * s * ey + stick * s * (r.vy - velY[k]);
            }
          }

          velX[k] = (velX[k] + fx) * damp;
          velY[k] = (velY[k] + fy) * damp;
        }
      }

      for (let k = 0; k < vertexCount; k++) {
        dispX[k] += velX[k];
        dispY[k] += velY[k];
      }
    };

    // Tuning panel. Every change applies live and is saved for next time.
    const gui = new GUI({ title: "Intro settings" });
    gui.add(settings, "ease", 0.01, 0.3, 0.005).name("fly speed");
    gui
      .add(settings, "titleScale", 0.2, 1, 0.01)
      .name("name size")
      .onFinishChange(sizeTitle);
    const jellyFolder = gui.addFolder("Jelly");
    jellyFolder.add(settings, "reach", 0, 2, 0.01).name("reach");
    jellyFolder.add(settings, "pull", 0, 0.3, 0.005).name("pull to edge");
    jellyFolder.add(settings, "stick", 0, 1, 0.01).name("stickiness");
    jellyFolder.add(settings, "maxStretch", 0.1, 4, 0.05).name("max stretch");
    jellyFolder.add(settings, "rearm", 0, 2, 0.01).name("re-stick within");
    jellyFolder.add(settings, "spring", 0.001, 0.2, 0.001).name("spring back");
    jellyFolder.add(settings, "cohesion", 0, 0.25, 0.005).name("cohesion");
    jellyFolder.add(settings, "damp", 0.5, 0.995, 0.005).name("wobble (damping)");
    gui.onChange(() => saveSettings(settings));
    gui.add(
      {
        reset: () => {
          Object.assign(settings, DEFAULTS);
          gui.controllersRecursive().forEach((c) => c.updateDisplay());
          saveSettings(settings);
          sizeTitle();
        },
      },
      "reset",
    ).name("reset to defaults");
    gui.add(
      {
        copy: () => {
          void navigator.clipboard?.writeText(JSON.stringify(settings, null, 2));
        },
      },
      "copy",
    ).name("copy values");

    let raf = 0;
    const animate = () => {
      for (const t of tiles) {
        t.mesh.position.lerp(t.target, settings.ease);
        t.material.opacity += (t.targetOpacity - t.material.opacity) * settings.ease;
      }
      // Retire tiles that have faded out.
      const survivors: Tile[] = [];
      for (const t of tiles) {
        if (t.exiting && t.material.opacity < 0.02) {
          scene.remove(t.mesh);
          t.material.dispose();
        } else {
          survivors.push(t);
        }
      }
      tiles = survivors;

      stepJelly();

      // The images, then the wordmark over them.
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(titleScene, camera);
      renderer.autoClear = true;

      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      mount.removeEventListener("click", onClick);
      gui.destroy();
      resizeObserver.disconnect();
      for (const t of tiles) t.material.dispose();
      for (const tex of texCache.values()) tex.dispose();
      titleTex.dispose();
      titleMat.dispose();
      titleGeom.dispose();
      geometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [images]);

  return <div ref={mountRef} className="h-screen w-full" />;
}
