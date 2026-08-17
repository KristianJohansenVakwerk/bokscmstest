"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type WallImage = {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
};

// Grid layout of the wall, in world units. Each tile occupies a square SLOT
// (like the homepage's aspect-square cell); the image plane is scaled to its
// natural ratio and centered inside that slot (like object-contain).
const COLS = 12;
const SLOT = 1; // square cell size
const GAP = 0.12; // space between cells
const STEP = SLOT + GAP;

// Every tile rotates to "look at" the cursor, which floats LOOK_DEPTH world
// units in front of the wall. Bigger depth = subtler tilt; smaller = more
// dramatic as tiles at the edges swivel toward the center.
const LOOK_DEPTH = 2.5;

// Staggered easing: tiles close to the cursor turn quickly, distant tiles lag,
// so the "look" ripples outward. Ease per tile ramps from FAST (at the cursor)
// down to SLOW across STAGGER_RANGE world units.
const EASE_FAST = 0.22;
const EASE_SLOW = 0.025;
const STAGGER_RANGE = 6;

// Downscaled, same-origin texture URL via Next's image optimizer. Smaller bytes
// than the originals and no cross-origin taint, so decoding is much faster.
function textureUrl(src: string, w = 384, q = 70) {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
}

export default function Wall({ images }: { images: WallImage[] }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfafafa); // zinc-50, to match the app

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Build the wall: a centered grid of square slots.
    const rows = Math.max(1, Math.ceil(images.length / COLS));
    const wallWidth = COLS * STEP - GAP;
    const wallHeight = rows * STEP - GAP;

    // Pull the camera back exactly far enough that the wall's full width fills
    // the viewport (with a hair of margin). Depends on aspect, so it's recomputed
    // on resize. Camera stays centered on z — only distance changes here.
    const FIT_MARGIN = 1.03;
    const fitCameraToWidth = () => {
      const vFov = (camera.fov * Math.PI) / 180;
      const dist =
        (wallWidth * FIT_MARGIN) / (2 * Math.tan(vFov / 2) * camera.aspect);
      camera.position.x = 0;
      camera.position.z = dist; // preserve y (the scroll position)
    };
    fitCameraToWidth();

    // Vertical scroll bounds: how far the camera's center can travel so the wall
    // top/bottom line up with the viewport edges. Recomputed when aspect changes.
    let minScrollY = 0;
    let maxScrollY = 0; // top of the grid
    const updateScrollBounds = () => {
      const visHeight = (wallWidth * FIT_MARGIN) / camera.aspect;
      const half = wallHeight / 2 - visHeight / 2;
      // If the wall is shorter than the viewport, pin it centered.
      maxScrollY = half > 0 ? half : 0;
      minScrollY = half > 0 ? -half : 0;
    };
    updateScrollBounds();

    // Start at the top of the grid.
    let scrollTargetY = maxScrollY;
    camera.position.y = maxScrollY;
    const originX = -wallWidth / 2 + SLOT / 2;
    const originY = wallHeight / 2 - SLOT / 2;

    const geometry = new THREE.PlaneGeometry(1, 1); // unit plane, scaled per tile
    const disposables: Array<{ dispose: () => void }> = [geometry];

    type Tile = {
      img: WallImage;
      material: THREE.MeshBasicMaterial;
      mesh: THREE.Mesh;
      w: number;
      h: number;
    };
    const tiles: Tile[] = [];

    images.forEach((img, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      // Contain the natural aspect ratio inside the square slot.
      const aspect = img.width / img.height;
      const w = aspect >= 1 ? SLOT : SLOT * aspect;
      const h = aspect >= 1 ? SLOT / aspect : SLOT;

      const material = new THREE.MeshBasicMaterial({ color: 0xe4e4e7 });
      disposables.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(w, h, 1);
      mesh.position.set(originX + col * STEP, originY - row * STEP, 0);
      scene.add(mesh);
      tiles.push({ img, material, mesh, w, h });
    });

    // Stream textures with a bounded concurrency queue so we don't open a
    // hundred connections at once — the wall fills in progressively.
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    const MAX_CONCURRENT = 6;
    let cursor = 0;

    const loadNext = () => {
      if (cancelled) return;
      const tile = tiles[cursor++];
      if (!tile) return;
      loader.load(
        textureUrl(tile.img.url),
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          tile.material.map = texture;
          tile.material.color.set(0xffffff);
          tile.material.needsUpdate = true;
          disposables.push(texture);
          loadNext();
        },
        undefined,
        () => {
          // Skip failures (leave the placeholder tint) and keep the queue moving.
          loadNext();
        },
      );
    };
    for (let k = 0; k < Math.min(MAX_CONCURRENT, tiles.length); k++) loadNext();

    // The camera no longer reacts to the mouse. Instead we track the pointer in
    // normalized device coords and raycast it onto the wall plane each frame;
    // tiles near that point animate. The wheel still scrolls vertically.
    const pointerNDC = new THREE.Vector2();
    let hasPointer = false;
    const raycaster = new THREE.Raycaster();
    const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const cursorWorld = new THREE.Vector3();
    // Scratch objects reused each frame to build the per-tile target rotation.
    const aimer = new THREE.Object3D();
    const targetQuat = new THREE.Quaternion();
    const restQuat = new THREE.Quaternion(); // identity: facing straight ahead

    const onPointerMove = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      hasPointer = true;
    };
    const onPointerLeave = () => {
      hasPointer = false;
    };
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerleave", onPointerLeave);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scrollTargetY = Math.min(
        maxScrollY,
        Math.max(minScrollY, scrollTargetY - e.deltaY * 0.01),
      );
    };
    mount.addEventListener("wheel", onWheel, { passive: false });

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      fitCameraToWidth();
      updateScrollBounds();
      scrollTargetY = Math.min(maxScrollY, Math.max(minScrollY, scrollTargetY));
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    let raf = 0;
    const animate = () => {
      // Scroll the camera vertically; it always looks straight ahead.
      camera.position.y += (scrollTargetY - camera.position.y) * 0.12;
      camera.lookAt(0, camera.position.y, 0);

      // Resolve the cursor's position on the wall plane for this frame.
      let cursorOnWall = false;
      if (hasPointer) {
        raycaster.setFromCamera(pointerNDC, camera);
        cursorOnWall =
          raycaster.ray.intersectPlane(wallPlane, cursorWorld) !== null;
      }

      // Point the cursor's "look" target LOOK_DEPTH in front of the wall so
      // tiles swivel their face toward it rather than turning edge-on.
      const lookZ = LOOK_DEPTH;

      // Turn every tile to look at the cursor (or back to facing straight when
      // the pointer is gone). The ease speed is distance-based, so tiles far
      // from the cursor lag behind — the turn ripples out and trails back in.
      for (const t of tiles) {
        // Distance to the (last known) cursor point drives the stagger, so tiles
        // keep trailing even after the pointer leaves.
        const dx = t.mesh.position.x - cursorWorld.x;
        const dy = t.mesh.position.y - cursorWorld.y;
        const d = Math.hypot(dx, dy);

        if (cursorOnWall) {
          aimer.position.copy(t.mesh.position);
          aimer.up.set(0, 1, 0);
          aimer.lookAt(cursorWorld.x, cursorWorld.y, lookZ);
          targetQuat.copy(aimer.quaternion);
        } else {
          targetQuat.copy(restQuat);
        }

        const prox = Math.max(0, 1 - d / STAGGER_RANGE);
        const ease = EASE_SLOW + (EASE_FAST - EASE_SLOW) * prox;
        t.mesh.quaternion.slerp(targetQuat, ease);
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerleave", onPointerLeave);
      mount.removeEventListener("wheel", onWheel);
      resizeObserver.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [images]);

  return <div ref={mountRef} className="h-screen w-full" />;
}
