import type { ReactNode } from "react";

import IterationsNav from "./nav";

export default function IterationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans">
      <IterationsNav />
      <div className="pt-14">{children}</div>
    </div>
  );
}
