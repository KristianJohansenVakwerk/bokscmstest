"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The site's view state, shared between the global nav dropdown and the page.
//
// `contactOpen` drives the final site's global contact overlay, which shows on
// top of whatever route is current (see contact-overlay.tsx).
//
// `mode` is only used by the /iterations pages, which switch views in-page:
// "intro" is the wordmark landing, "index" is the thumbnail grid, "contact"
// shows their own contact card.
export type ViewMode = "intro" | "index" | "contact";

type ViewContextValue = {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  contactOpen: boolean;
  setContactOpen: (open: boolean) => void;
};

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ViewMode>("intro");
  const [contactOpen, setContactOpen] = useState(false);
  return (
    <ViewContext.Provider value={{ mode, setMode, contactOpen, setContactOpen }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useView must be used within a ViewProvider");
  return ctx;
}
