"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ITERATION_COUNT } from "@/lib/mosaic";

export default function IterationsNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-zinc-300 bg-white px-5 py-3 shadow-sm">
      <span className="mr-2 text-sm font-semibold uppercase tracking-wide text-zinc-900">
        Iterations
      </span>
      {Array.from({ length: ITERATION_COUNT }, (_, i) => i + 1).map((n) => {
        const href = `/iterations/${n}`;
        const active = pathname === href;
        return (
          <Link
            key={n}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white"
                : "flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            }
          >
            {n}
          </Link>
        );
      })}
    </nav>
  );
}
