"use client";

import { usePathname, useRouter } from "next/navigation";

import { ITERATION_COUNT } from "@/lib/mosaic";

export default function IterationsNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Global nav, but not inside the Payload admin.
  if (pathname.startsWith("/admin")) return null;

  const match = pathname.match(/\/iterations\/(\d+)/);
  const current = match ? `/iterations/${match[1]}` : pathname === "/" ? "/" : "";

  return (
    <select value={current} onChange={(e) => router.push(e.target.value)}>
      <option value="/">Landing page</option>
      {Array.from({ length: ITERATION_COUNT }, (_, i) => i + 1).map((n) => (
        <option key={n} value={`/iterations/${n}`}>
          Iteration {n}
        </option>
      ))}
    </select>
  );
}
