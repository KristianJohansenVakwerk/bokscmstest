"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type SceneImage = {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
};

// Layout constants. The stage is a 12-column grid whose full width fills the
// viewport; column spans decide how wide each image sits.
const COLS = 12;
const COUNT = 5; // images shown at once
const FIT_MARGIN = 1.0; // 12 columns span the viewport width exactly
const EASE = 0.09; // fly-in / fly-out tween speed
const FOV = 55;

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
    // front of and behind each other. The wordmark is a DOM overlay on top of
    // the canvas (see home.tsx), so it's never covered.
    const TEXT_Z = 0;

    type Tile = {
      mesh: THREE.Mesh;
      material: THREE.MeshBasicMaterial;
      target: THREE.Vector3;
      targetOpacity: number;
      exiting: boolean;
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
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    let raf = 0;
    const animate = () => {
      for (const t of tiles) {
        t.mesh.position.lerp(t.target, EASE);
        t.material.opacity += (t.targetOpacity - t.material.opacity) * EASE;
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

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      mount.removeEventListener("click", onClick);
      resizeObserver.disconnect();
      for (const t of tiles) t.material.dispose();
      for (const tex of texCache.values()) tex.dispose();
      geometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [images]);

  return <div ref={mountRef} className="h-screen w-full" />;
}
