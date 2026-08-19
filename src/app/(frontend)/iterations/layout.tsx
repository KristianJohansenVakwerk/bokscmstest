import type { ReactNode } from "react";

export default function IterationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-white font-sans">{children}</div>
  );
}
