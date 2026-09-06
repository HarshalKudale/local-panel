import React, { useState, useRef, useEffect } from "react";
import { Panel, PanelEntry } from "@/lib/panelRegistry";
import { Workspace } from "@/types";
import NavItem from "@/components/sidebar/NavItem";
import NavSection from "@/components/sidebar/NavSection";
import { Plus, Pencil, Trash2, Settings } from "@/lib/icons";
import { strings } from "@/lib/strings";
import { Button, Input } from "@/components/ui";

interface Props {
    entries: PanelEntry[];
    activePanel: Panel;
    onPanelSelect: (id: Panel) => void;
    badges: Partial<Record<Panel, number | undefined>>;
    workspaces: Workspace[];
    activeWorkspaceId: string;
    onWorkspaceChange: (id: string) => void;
    onWorkspaceCreate: () => void;
    onWorkspaceRename: (id: string, name: string) => void;
    onWorkspaceDelete: (id: string) => void;
    collapsed: boolean;
}

/** Generate up to 2-letter initials from a workspace name */
function wsInitials(name: string): string {
    const words = name.trim().split(/\s+/);
    return words.slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "WS";
}

export default function AppSidebar({
    entries, activePanel, onPanelSelect, badges,
    workspaces, activeWorkspaceId,
    onWorkspaceChange, onWorkspaceCreate, onWorkspaceRename, onWorkspaceDelete,
    collapsed,
}: Props) {
    const [wsSwitcherOpen, setWsSwitcherOpen] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const switcherRef = useRef<HTMLDivElement>(null);
    const renameRef = useRef<HTMLInputElement>(null);

    const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
    const canDelete = workspaces.length > 1;

    // Close dropdown on outside click
    useEffect(() => {
        if (!wsSwitcherOpen) return;
        const handler = (e: MouseEvent) => {
            if (wsSwitcherOpen && switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
                setWsSwitcherOpen(false);
                setRenamingId(null);
                setConfirmDeleteId(null);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [wsSwitcherOpen]);

    // Focus rename input when rename mode activates
    useEffect(() => {
        if (renamingId) renameRef.current?.focus();
    }, [renamingId]);

    const handleRenameCommit = (id: string) => {
        const name = renameValue.trim();
        if (name) onWorkspaceRename(id, name);
        setRenamingId(null);
        setRenameValue("");
    };

    const handleDeleteConfirm = (id: string) => {
        onWorkspaceDelete(id);
        setConfirmDeleteId(null);
        setWsSwitcherOpen(false);
    };

    // Group entries by section (preserving insertion order)
    type Section = { label: string; type: "flat" | "collapsible"; items: PanelEntry[] };
    const sections: Section[] = [];
    const sectionMap = new Map<string, Section>();
    for (const entry of entries) {
        let sec = sectionMap.get(entry.section);
        if (!sec) {
            sec = { label: entry.section, type: entry.sectionType, items: [] };
            sectionMap.set(entry.section, sec);
            sections.push(sec);
        }
        sec.items.push(entry);
    }

    // ── Collapsed (icon-only) mode ───────────────────────────────────────
    if (collapsed) {
        return (
            <div className="w-12 flex flex-col h-full overflow-hidden items-center">
                {/* Nav icons (scrollable) */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2 py-1 flex flex-col items-center gap-0.5">
                    {sections.map((section) => {
                        if (section.type === "collapsible") {
                            return (
                                <NavSection
                                    key={section.label}
                                    label={section.label}
                                    items={section.items.map((e) => ({ id: e.id, label: e.label, icon: e.icon }))}
                                    activePanel={activePanel}
                                    badges={badges as Record<string, number | undefined>}
                                    onSelect={(id) => onPanelSelect(id as Panel)}
                                    storageKey={section.label.toLowerCase()}
                                    collapsed
                                />
                            );
                        }
                        return (
                            <React.Fragment key={section.label}>
                                {/* Thin separator line instead of section header */}
                                <div className="w-6 border-t border-border/40 my-1" />
                                {section.items.map((n) => (
                                    <NavItem
                                        key={n.id}
                                        id={n.id}
                                        label={n.label}
                                        icon={n.icon}
                                        active={activePanel === n.id}
                                        badge={badges[n.id]}
                                        collapsed
                                        onClick={() => onPanelSelect(n.id)}
                                    />
                                ))}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Sticky workspace footer (icon-only) */}
                <div className="flex-shrink-0 border-t border-border bg-surface py-2 flex flex-col items-center gap-1.5 relative">
                    {/* Settings icon */}
                    <button
                        type="button"
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                            activePanel === "settings"
                                ? "text-signal bg-card"
                                : "text-muted-foreground hover:text-foreground hover:bg-card"
                        }`}
                        onClick={() => onPanelSelect("settings")}
                        title={strings.nav.settings}
                        aria-label={strings.nav.settings}
                        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    >
                        <Settings size={14} />
                    </button>

                    {/* Workspace avatar */}
                    <button
                        type="button"
                        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-card transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        onClick={() => setWsSwitcherOpen((v) => !v)}
                        aria-haspopup="menu"
                        aria-expanded={wsSwitcherOpen}
                        title={activeWs?.name ?? strings.sidebar.workspace}
                        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    >
                        <span
                            className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 select-none"
                            style={{ background: "var(--c-signal)", color: "var(--c-background)" }}
                        >
                            {wsInitials(activeWs?.name ?? "")}
                        </span>
                    </button>

                    {/* Workspace switcher dropdown */}
                    {wsSwitcherOpen && renderWorkspaceSwitcher()}
                </div>
            </div>
        );
    }

    // ── Expanded mode ────────────────────────────────────────────────────

    function renderWorkspaceSwitcher() {
        return (
            <>
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => { setWsSwitcherOpen(false); setRenamingId(null); setConfirmDeleteId(null); }}
                />
                <div
                    ref={switcherRef}
                    className="absolute bottom-full left-0 z-50 bg-card border border-border rounded-md shadow-2xl py-1 animate-scale-in"
                    style={{ minWidth: "192px" }}
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { onWorkspaceCreate(); setWsSwitcherOpen(false); }}
                        className="w-full justify-start rounded-none border-b border-border/60 px-3 text-sm text-signal hover:bg-surface-2"
                    >
                        <Plus size={12} />
                        {strings.sidebar.createWorkspace}
                    </Button>

                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {strings.sidebar.workspaces}
                    </div>

                    {workspaces.map((ws) => {
                        const isConfirming = confirmDeleteId === ws.id;
                        return (
                            <div key={ws.id}>
                                <div
                                    className={`group flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-surface-2 ${activeWorkspaceId === ws.id ? "text-signal font-semibold" : "text-foreground"}`}
                                    onClick={() => {
                                        if (renamingId !== ws.id && !isConfirming) {
                                            onWorkspaceChange(ws.id);
                                            setWsSwitcherOpen(false);
                                            setRenamingId(null);
                                            setConfirmDeleteId(null);
                                        }
                                    }}
                                >
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeWorkspaceId === ws.id ? "bg-signal" : "bg-muted-foreground/30"}`}
                                        style={{ boxShadow: activeWorkspaceId === ws.id ? "0 0 4px var(--c-signal)" : "none" }}
                                    />
                                    {renamingId === ws.id ? (
                                        <Input
                                            ref={renameRef}
                                            inputSize="sm"
                                            className="flex-1 min-w-0 bg-surface-2 border-signal/40"
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => {
                                                e.stopPropagation();
                                                if (e.key === "Enter") handleRenameCommit(ws.id);
                                                if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                                            }}
                                            onBlur={() => handleRenameCommit(ws.id)}
                                        />
                                    ) : (
                                        <span className="flex-1 truncate">{ws.name}</span>
                                    )}
                                    {renamingId !== ws.id && (
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                                            <button
                                                type="button"
                                                className="text-muted-foreground hover:text-signal text-[10px] px-1 py-0.5 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/35"
                                                title={strings.sidebar.renameWorkspace}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRenamingId(ws.id);
                                                    setRenameValue(ws.name);
                                                    setConfirmDeleteId(null);
                                                }}
                                            >
                                                <Pencil size={10} />
                                            </button>
                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    className="text-muted-foreground hover:text-destructive text-[10px] px-1 py-0.5 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/35"
                                                    title={strings.sidebar.deleteWorkspace}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmDeleteId(isConfirming ? null : ws.id);
                                                        setRenamingId(null);
                                                    }}
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {isConfirming && (
                                    <div
                                        className="mx-3 mb-1.5 px-2.5 py-2 rounded border border-destructive/30 bg-destructive/5"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <p className="text-[10px] text-muted-foreground leading-snug mb-2">
                                            {strings.sidebar.deleteWorkspacePrefix} <span className="font-semibold text-foreground">"{ws.name}"</span>{strings.sidebar.deleteWorkspaceSuffix}
                                        </p>
                                        <div className="flex gap-1.5">
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => handleDeleteConfirm(ws.id)}
                                                className="flex-1 border border-destructive/40 bg-destructive/15 justify-center text-[10px] hover:bg-destructive/25"
                                            >
                                                {strings.common.delete}
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setConfirmDeleteId(null)}
                                                className="flex-1 justify-center text-[10px]"
                                            >
                                                {strings.common.cancel}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">

            {/* -- Nav sections (scrollable) ------------------------------- */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1">
                {sections.map((section) => {
                    if (section.type === "collapsible") {
                        return (
                            <NavSection
                                key={section.label}
                                label={section.label}
                                items={section.items.map((e) => ({ id: e.id, label: e.label, icon: e.icon }))}
                                activePanel={activePanel}
                                badges={badges as Record<string, number | undefined>}
                                onSelect={(id) => onPanelSelect(id as Panel)}
                                storageKey={section.label.toLowerCase()}
                            />
                        );
                    }
                    return (
                        <React.Fragment key={section.label}>
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2.5 pt-3 pb-1 whitespace-nowrap">
                                {section.label}
                            </div>
                            {section.items.map((n) => (
                                <NavItem
                                    key={n.id}
                                    id={n.id}
                                    label={n.label}
                                    icon={n.icon}
                                    active={activePanel === n.id}
                                    badge={badges[n.id]}
                                    onClick={() => onPanelSelect(n.id)}
                                />
                            ))}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* -- Sticky workspace footer --------------------------------- */}
            <div className="flex-shrink-0 border-t border-border bg-surface relative">
                <div className="flex items-center gap-1.5 px-2 py-2">

                    {/* Avatar + name -> opens workspace switcher */}
                    <button
                        type="button"
                        className="flex min-h-10 items-center gap-2 flex-1 min-w-0 rounded-md hover:bg-card px-2 py-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        onClick={() => setWsSwitcherOpen((v) => !v)}
                        aria-haspopup="menu"
                        aria-expanded={wsSwitcherOpen}
                        title={strings.sidebar.switchWorkspace}
                        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    >
                        <span
                            className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 select-none"
                            style={{ background: "var(--c-signal)", color: "var(--c-background)" }}
                        >
                            {wsInitials(activeWs?.name ?? "")}
                        </span>
                        <span className="text-xs text-foreground font-medium truncate flex-1 text-left">
                            {activeWs?.name ?? strings.sidebar.workspace}
                        </span>
                    </button>

                    {/* Global Settings button */}
                    <button
                        type="button"
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface flex-shrink-0 ${
                            activePanel === "settings"
                                ? "text-signal bg-card"
                                : "text-muted-foreground hover:text-foreground hover:bg-card"
                        }`}
                        onClick={() => onPanelSelect("settings")}
                        title={strings.nav.settings}
                        aria-label={strings.nav.settings}
                        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    >
                        <Settings size={14} />
                    </button>
                </div>

                {/* Workspace switcher dropdown - opens upward */}
                {wsSwitcherOpen && renderWorkspaceSwitcher()}
            </div>
        </div>
    );
}
