import { useState, useEffect } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "lp-theme";

// Overlay colors must match the CSS token values for each theme
const OVERLAY: Record<Theme, { color: string; symbolColor: string }> = {
  dark: { color: "#010f1f", symbolColor: "#908fa0" },
  light: { color: "#dde4ef", symbolColor: "#464554" },
};

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove("dark", "light");
  html.classList.add(theme);
  // Sync Electron titlebar overlay — best-effort (no-op in browser/test env)
  window.api?.setTitleBarOverlay?.(OVERLAY[theme].color, OVERLAY[theme].symbolColor);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setThemeState];
}
