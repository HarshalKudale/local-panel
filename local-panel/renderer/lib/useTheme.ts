import { useState, useEffect } from "react";
import { ThemeDef, getThemeById, DEFAULT_THEME_ID } from "./themes";

export type Theme = string; // theme id

const STORAGE_KEY = "lp-theme";

function applyTheme(themeDef: ThemeDef) {
  const html = document.documentElement;
  // Set dark/light class for Tailwind darkMode: "class"
  html.classList.remove("dark", "light");
  html.classList.add(themeDef.mode);

  // Toggle the "Terminal CLI" chrome (monospace-everywhere, 0 radius, scanlines, glow)
  html.classList.toggle("theme-terminal", !!themeDef.terminal);

  // Apply all CSS custom properties
  for (const [key, value] of Object.entries(themeDef.vars)) {
    html.style.setProperty(`--${key}`, value);
  }

  // Sync Electron titlebar overlay - best-effort (no-op in browser/test env)
  window.api?.setTitleBarOverlay?.(themeDef.overlay.color, themeDef.overlay.symbolColor);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [themeId, setThemeId] = useState<Theme>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
  });

  useEffect(() => {
    const def = getThemeById(themeId);
    applyTheme(def);
    localStorage.setItem(STORAGE_KEY, themeId);
  }, [themeId]);

  return [themeId, setThemeId];
}

