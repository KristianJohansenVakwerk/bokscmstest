"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The site's view state, shared between the global nav dropdown and the active
// iteration view. "intro" is the wordmark landing, "index" is the thumbnail
// grid, "contact" hides both (placeholder for now).
export type ViewMode = "intro" | "index" | "contact";

type ViewContextValue = {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
};

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ViewMode>("intro");
  return (
    <ViewContext.Provider value={{ mode, setMode }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useView must be used within a ViewProvider");
  return ctx;
}
