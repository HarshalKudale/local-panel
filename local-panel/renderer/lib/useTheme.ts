import { useState, useEffect } from "react";
import { ThemeDef, getThemeById, DEFAULT_THEME_ID } from "./themes";

export type Theme = string; // theme id

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

/**
 * Theme preference is persisted on disk (app.json, via the main-process settings
 * store) rather than in the renderer's localStorage. localStorage lives inside
 * Electron's Chromium userData/session partition, which is a separate, easy-to-lose
 * store (e.g. e2e/test profiles, "clear browsing data", per-profile isolation) — it
 * is not the single source of truth the rest of the app's settings use.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [themeId, setThemeId] = useState<Theme>(DEFAULT_THEME_ID);
  const [loaded, setLoaded] = useState(false);

  // Load the persisted theme from disk on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await window.api?.getTheme?.();
        if (!cancelled && stored) setThemeId(stored);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(getThemeById(themeId));
    // Avoid writing the fallback default back to disk before the real persisted
    // value has been loaded.
    if (loaded) {
      window.api?.setTheme?.(themeId);
    }
  }, [themeId, loaded]);

  return [themeId, setThemeId];
}
