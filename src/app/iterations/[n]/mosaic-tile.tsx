"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import type { Placement } from "@/lib/mosaic";

export default function MosaicTile({ p }: { p: Placement }) {
  const ref = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <li
      ref={ref}
      className="relative transition-opacity duration-700 ease-out"
      style={{
        gridColumn: `${p.colStart} / span ${p.colSpan}`,
        gridRow: `${p.rowStart} / span ${p.rowSpan}`,
        zIndex: p.z,
        transform: p.overlap ? `translate(${p.dx}%, ${p.dy}%)` : undefined,
        opacity: visible ? 1 : 0,
      }}
    >
      <Image
        src={p.imageUrl}
        alt={p.imageAlt}
        fill
        sizes="(max-width: 768px) 100vw, 66vw"
        className="object-contain"
      />
    </li>
  );
}
