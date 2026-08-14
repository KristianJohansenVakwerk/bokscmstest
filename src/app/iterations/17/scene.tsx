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
const EASE = 0.09; // fade in / fade out tween speed
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

export default function Scene({
  images,
  onEnter,
}: {
  images: SceneImage[];
  onEnter: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Keep the latest onEnter without re-running the whole scene effect.
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || images.length === 0) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfafafa); // zinc-50, to match the app

    const camera = new THREE.PerspectiveCamera(
      FOV,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    // The box overlay is drawn in a second pass, so clear manually (see animate).
    renderer.autoClear = false;
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

    // Centered wordmark: the KARL MONIES logo (an SVG in /public), rasterized to
    // a canvas and mapped onto a plane so images can layer in front of or behind
    // it inside the 3D scene. It lives at TEXT_Z=0; images get a random +z (in
    // front) or -z (behind).
    const TEXT_Z = 0;
    const SS = 4; // supersample factor reused by the per-image labels below
    // Intrinsic SVG size, from its viewBox — this fixes the logo's aspect ratio.
    const LOGO_ASPECT = 1804.858 / 187.795;
    const SIDE_MARGIN_PX = 30; // css px of empty space on each side of the logo

    // High-res offscreen canvas the SVG is drawn into once it loads. Sized to the
    // logo's aspect so the rasterization stays crisp when scaled across the wall.
    const LOGO_CANVAS_W = 3072;
    const titleCanvas = document.createElement("canvas");
    titleCanvas.width = LOGO_CANVAS_W;
    titleCanvas.height = Math.round(LOGO_CANVAS_W / LOGO_ASPECT);
    const titleTex = new THREE.CanvasTexture(titleCanvas);
    titleTex.colorSpace = THREE.SRGBColorSpace;
    titleTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const titleMat = new THREE.MeshBasicMaterial({
      map: titleTex,
      transparent: true,
      depthWrite: false,
    });
    const titleMesh = new THREE.Mesh(geometry, titleMat);
    titleMesh.position.set(0, 0, TEXT_Z);
    scene.add(titleMesh);

    // Draw the SVG into the canvas once it decodes, then refresh the texture.
    const logoImg = new Image();
    logoImg.onload = () => {
      if (cancelled) return;
      const lctx = titleCanvas.getContext("2d")!;
      lctx.clearRect(0, 0, titleCanvas.width, titleCanvas.height);
      lctx.drawImage(logoImg, 0, 0, titleCanvas.width, titleCanvas.height);
      titleTex.needsUpdate = true;
    };
    logoImg.src = "/karl-logo.svg";

    // Size the logo to span the viewport width minus SIDE_MARGIN_PX on each side.
    // The visible width at z=0 is exactly WALL_WIDTH, so one css pixel is
    // WALL_WIDTH/clientWidth world units; the height follows from the aspect.
    const sizeTitle = () => {
      const worldPerPx = WALL_WIDTH / mount.clientWidth;
      const worldW = (mount.clientWidth - 2 * SIDE_MARGIN_PX) * worldPerPx;
      titleMesh.scale.set(worldW, worldW / LOGO_ASPECT, 1);
    };
    sizeTitle();

    // Per-image filename labels: 16px Helvetica Neue regular on a canvas, mapped
    // to a plane placed just under each tile. Sized in world units the same way
    // as the title so the text reads ~16px at any viewport width.
    const LABEL_PX = 16;
    const LABEL_GAP = 0.06; // world-unit gap between an image and its label
    const labelFont = `400 ${LABEL_PX * SS}px "Graphik-Regular", "Helvetica Neue", Helvetica, Arial, sans-serif`;
    // Labels are painted onto a canvas, which ignores CSS @font-face until the
    // web font is actually loaded — so preload it once and await this before the
    // first spawn, otherwise the earliest labels bake in the fallback face.
    const labelFontReady = document.fonts
      ? document.fonts.load(labelFont).catch(() => {})
      : Promise.resolve();
    const fileNameOf = (url: string) => {
      const path = decodeURIComponent(url.split("?")[0]);
      return path.slice(path.lastIndexOf("/") + 1) || url;
    };
    const makeLabelTexture = (text: string) => {
      const canvas = document.createElement("canvas");
      const c = canvas.getContext("2d")!;
      c.font = labelFont;
      const lineH = LABEL_PX * SS * 1.3;
      canvas.width = Math.max(1, Math.ceil(c.measureText(text).width));
      canvas.height = Math.max(1, Math.ceil(lineH));
      c.font = labelFont; // resizing the canvas resets the context
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#000000";
      c.fillText(text, canvas.width / 2, canvas.height / 2);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return { tex, pxW: canvas.width / SS, pxH: canvas.height / SS };
    };

    type Tile = {
      mesh: THREE.Mesh;
      material: THREE.MeshBasicMaterial;
      target: THREE.Vector3;
      targetOpacity: number;
      exiting: boolean;
      label: THREE.Mesh;
      labelMat: THREE.MeshBasicMaterial;
      labelTex: THREE.Texture;
      labelPxW: number;
      labelPxH: number;
      imgW: number; // image world width, to left-align the label
      imgH: number; // image world height, to offset the label below it
      labelDx: number; // horizontal offset from image center to label center
      labelDy: number; // vertical offset from image center to label center
    };
    let tiles: Tile[] = [];

    // Position/scale a tile's label in world units (recomputed on resize). The
    // label is left-aligned to the image's left edge.
    const sizeLabel = (tile: Tile) => {
      const worldPerPx = WALL_WIDTH / mount.clientWidth;
      const worldW = tile.labelPxW * worldPerPx;
      const worldH = tile.labelPxH * worldPerPx;
      tile.label.scale.set(worldW, worldH, 1);
      tile.labelDx = -tile.imgW / 2 + worldW / 2;
      tile.labelDy = -(tile.imgH / 2 + LABEL_GAP + worldH / 2);
    };

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

    const spawn = (p: Placement) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0xe4e4e7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      // Random layer: half the images sit in front of the title, half behind.
      // A little jitter keeps images within a band from z-fighting each other.
      const front = Math.random() < 0.5;
      const z = TEXT_Z + (front ? 1 : -1) * (0.2 + Math.random() * 0.5);
      mesh.scale.set(p.w, p.h, 1);
      // Fade transition: the tile appears in its final spot and only its opacity
      // animates, so there's no fly-in movement.
      const start = new THREE.Vector3(p.x, p.y, z);
      mesh.position.copy(start);
      scene.add(mesh);
      applyTexture(p.img.url, material);

      // Filename label, sharing the image's z-layer and opacity, riding below it.
      const { tex: labelTex, pxW, pxH } = makeLabelTexture(fileNameOf(p.img.url));
      const labelMat = new THREE.MeshBasicMaterial({
        map: labelTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const label = new THREE.Mesh(geometry, labelMat);
      scene.add(label);

      const tile: Tile = {
        mesh,
        material,
        target: new THREE.Vector3(p.x, p.y, z),
        targetOpacity: 1,
        exiting: false,
        label,
        labelMat,
        labelTex,
        labelPxW: pxW,
        labelPxH: pxH,
        imgW: p.w,
        imgH: p.h,
        labelDx: 0,
        labelDy: 0,
      };
      sizeLabel(tile);
      label.position.set(start.x + tile.labelDx, start.y + tile.labelDy, z);
      tiles.push(tile);
    };

    const spawnLayout = async () => {
      const picked = pickImages();
      // Learn each image's true (EXIF-corrected) aspect before laying out, and
      // make sure the label web font is ready so canvas labels use Graphik.
      const [aspects] = await Promise.all([
        Promise.all(picked.map((img) => loadAspect(img.url))),
        labelFontReady,
      ]);
      if (cancelled) return;
      const sized = picked.map((img, i) => ({ img, aspect: aspects[i] }));
      for (const p of makeLayout(sized)) spawn(p);
    };

    // A small box pinned to the bottom-right of the viewport. On each layout swap
    // it flips a half-turn — on x only, y only, or both axes (picked at random,
    // each in a random direction) — eased with the same EASE as the tile fade, so
    // it lasts as long as the fade.
    //
    // It renders through its OWN orthographic camera in a separate overlay scene,
    // composited on top of the main render. That avoids the perspective camera's
    // off-axis skew at the screen corner, so the cube always reads as square. Its
    // lights live in the overlay scene, so the unlit image planes are untouched.
    const boxScene = new THREE.Scene();
    // Vertical axis is fixed to [-1, 1]; the horizontal is widened to the aspect
    // in placeBox so a unit here is the same on both axes (the cube stays square).
    const boxCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    boxCamera.position.z = 2;
    boxScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const boxLight = new THREE.DirectionalLight(0xffffff, 1.2);
    boxLight.position.set(2, 3, 4);
    boxScene.add(boxLight);

    const BOX_SIZE = 0.047; // fraction of the viewport half-height
    const boxGeometry = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x1a1818, // matches the logo ink
      roughness: 0.5,
      metalness: 0,
    });
    const box = new THREE.Mesh(boxGeometry, boxMat);
    boxScene.add(box);
    const boxTargetRot = { x: 0, y: 0 };

    // Widen the ortho frustum to the current aspect and park the box in the
    // bottom-right corner with a small margin.
    const placeBox = () => {
      const aspect = mount.clientWidth / mount.clientHeight;
      boxCamera.left = -aspect;
      boxCamera.right = aspect;
      boxCamera.updateProjectionMatrix();
      const margin = 0.05; // in ortho units
      box.position.set(
        aspect - BOX_SIZE / 2 - margin,
        -1 + BOX_SIZE / 2 + margin,
        0,
      );
    };
    placeBox();

    // Queue the next flip: randomly pick one of three modes — x only, y only, or
    // both axes — and add a half-turn (random direction) to the chosen axes.
    const flipBox = () => {
      const mode = Math.floor(Math.random() * 3); // 0: x, 1: y, 2: both
      const dir = () => (Math.random() < 0.5 ? 1 : -1);
      if (mode !== 1) boxTargetRot.x += Math.PI * dir();
      if (mode !== 0) boxTargetRot.y += Math.PI * dir();
    };

    // Fade the current tiles out in place, then fade a fresh random layout in.
    const swap = () => {
      for (const t of tiles) {
        if (t.exiting) continue;
        t.targetOpacity = 0;
        t.exiting = true;
      }
      flipBox();
      void spawnLayout();
    };

    void spawnLayout();

    // Intro behaviour: the layout reshuffles on its own every 2s, and a click
    // leaves the intro for the grid view.
    const auto = setInterval(swap, 2000);
    const onClick = () => onEnterRef.current();
    mount.addEventListener("click", onClick);

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      fitCamera();
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      sizeTitle();
      placeBox();
      for (const t of tiles) sizeLabel(t);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    let raf = 0;
    const animate = () => {
      for (const t of tiles) {
        t.mesh.position.lerp(t.target, EASE);
        t.material.opacity += (t.targetOpacity - t.material.opacity) * EASE;
        // The label rides just below the image, sharing its z-layer and fade.
        t.label.position.set(
          t.mesh.position.x + t.labelDx,
          t.mesh.position.y + t.labelDy,
          t.mesh.position.z,
        );
        t.labelMat.opacity = t.material.opacity;
      }
      // Retire tiles that have faded out.
      const survivors: Tile[] = [];
      for (const t of tiles) {
        if (t.exiting && t.material.opacity < 0.02) {
          scene.remove(t.mesh);
          t.material.dispose();
          scene.remove(t.label);
          t.labelMat.dispose();
          t.labelTex.dispose();
        } else {
          survivors.push(t);
        }
      }
      tiles = survivors;

      // Ease the box toward its queued rotation using the same EASE as the fade,
      // so a flip and a tile fade take the same time.
      box.rotation.x += (boxTargetRot.x - box.rotation.x) * EASE;
      box.rotation.y += (boxTargetRot.y - box.rotation.y) * EASE;

      // Manual two-pass render: main perspective scene, then the box overlay on
      // top with the depth buffer cleared so it always draws in front.
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(boxScene, boxCamera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearInterval(auto);
      mount.removeEventListener("click", onClick);
      resizeObserver.disconnect();
      for (const t of tiles) {
        t.material.dispose();
        t.labelMat.dispose();
        t.labelTex.dispose();
      }
      for (const tex of texCache.values()) tex.dispose();
      titleTex.dispose();
      titleMat.dispose();
      boxMat.dispose();
      boxGeometry.dispose();
      geometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [images]);

  // The title and the bottom-right flipping box both live inside the three.js
  // scene, so there's no DOM overlay here.
  return (
    <div className="relative h-screen w-full">
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
}
