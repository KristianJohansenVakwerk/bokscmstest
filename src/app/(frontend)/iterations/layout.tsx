import type { ReactNode } from "react";

export default function IterationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans">{children}</div>
  );
}
