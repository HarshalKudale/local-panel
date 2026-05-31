import { useState, useCallback } from "react";
import { Panel, PANEL_REGISTRY, ALWAYS_VISIBLE_PANELS } from "@/lib/panelRegistry";

const STORAGE_KEY = "sidebar-visibility";

function getStoredVisibility(): Record<Panel, boolean> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    // Default: all panels visible
    return Object.fromEntries(
        PANEL_REGISTRY.filter((e) => e.enabled && e.showInSidebar !== false)
            .map((e) => [e.id, true])
    ) as Record<Panel, boolean>;
}

function saveVisibility(v: Record<Panel, boolean>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
}

export function useSidebarVisibility() {
    const [visibility, setVisibility] = useState<Record<Panel, boolean>>(getStoredVisibility);

    const setPanelVisible = useCallback((id: Panel, visible: boolean) => {
        if (ALWAYS_VISIBLE_PANELS.includes(id)) return; // Cannot hide always-visible panels
        setVisibility((prev) => {
            const next = { ...prev, [id]: visible };
            saveVisibility(next);
            return next;
        });
    }, []);

    const isPanelVisible = useCallback((id: Panel): boolean => {
        if (ALWAYS_VISIBLE_PANELS.includes(id)) return true;
        return visibility[id] !== false; // default to visible
    }, [visibility]);

    return { visibility, setPanelVisible, isPanelVisible };
}
