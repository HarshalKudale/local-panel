import React, { useState, useRef, useEffect } from "react";
import { Panel, PanelEntry } from "@/lib/panelRegistry";
import { Workspace } from "@/types";
import NavItem from "@/components/sidebar/NavItem";
import NavSection from "@/components/sidebar/NavSection";
import { MoreHorizontal, Plus, Pencil, Trash2, ClipboardList, Settings } from "@/lib/icons";
import { Search } from "lucide-react";

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
}: Props) {
    const [search, setSearch] = useState("");
    const [wsSwitcherOpen, setWsSwitcherOpen] = useState(false);
    const [wsMenuOpen, setWsMenuOpen] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const searchRef = useRef<HTMLInputElement>(null);
    const switcherRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const renameRef = useRef<HTMLInputElement>(null);

    const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
    const canDelete = workspaces.length > 1;

    // ⌘K / Ctrl+K focuses search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);

    // Close dropdowns on outside click
    useEffect(() => {
        if (!wsSwitcherOpen && !wsMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (wsSwitcherOpen && switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
                setWsSwitcherOpen(false);
                setRenamingId(null);
                setConfirmDeleteId(null);
            }
            if (wsMenuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setWsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [wsSwitcherOpen, wsMenuOpen]);

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

    // Filter entries when search is active
    const query = search.trim().toLowerCase();
    const filteredEntries = query
        ? entries.filter((e) => e.label.toLowerCase().includes(query) || e.section.toLowerCase().includes(query))
        : entries;

    // Group entries by section (preserving insertion order)
    type Section = { label: string; type: "flat" | "collapsible"; items: PanelEntry[] };
    const sections: Section[] = [];
    const sectionMap = new Map<string, Section>();
    for (const entry of filteredEntries) {
        let sec = sectionMap.get(entry.section);
        if (!sec) {
            sec = { label: entry.section, type: entry.sectionType, items: [] };
            sectionMap.set(entry.section, sec);
            sections.push(sec);
        }
        sec.items.push(entry);
    }

    const isSearching = query.length > 0;

    return (
        <div className="w-48 flex flex-col h-full overflow-hidden">

            {/* ── Search ──────────────────────────────────────────────────── */}
            <div className="px-2 pt-2 pb-1 flex-shrink-0">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-bg2 border border-border/60">
                    <Search size={11} className="flex-shrink-0 text-text-dim opacity-60" />
                    <input
                        ref={searchRef}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") { setSearch(""); e.currentTarget.blur(); }
                        }}
                        placeholder="Search panels…"
                        className="flex-1 bg-transparent outline-none text-xs text-text-base placeholder:text-text-dim/50 min-w-0"
                    />
                    {!search && (
                        <span className="text-[9px] font-mono text-text-dim opacity-40 flex-shrink-0">⌘K</span>
                    )}
                </div>
            </div>

            {/* ── Nav sections (scrollable) ─────────────────────────────── */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1">
                {isSearching ? (
                    filteredEntries.length === 0 ? (
                        <div className="px-2.5 py-4 text-xs text-text-dim opacity-50 text-center">
                            No panels found
                        </div>
                    ) : (
                        <div className="flex flex-col gap-0.5">
                            {filteredEntries.map((n) => (
                                <NavItem
                                    key={n.id}
                                    id={n.id}
                                    label={n.label}
                                    icon={n.icon}
                                    active={activePanel === n.id}
                                    badge={badges[n.id]}
                                    onClick={() => { onPanelSelect(n.id); setSearch(""); }}
                                />
                            ))}
                        </div>
                    )
                ) : (
                    sections.map((section) => {
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
                                <div className="text-[10px] font-semibold uppercase tracking-widest text-text-dim px-2.5 pt-3 pb-1 whitespace-nowrap">
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
                    })
                )}
            </div>

            {/* ── Sticky workspace footer ───────────────────────────────── */}
            <div className="flex-shrink-0 border-t border-border bg-bg1 relative">
                <div className="flex items-center gap-1.5 px-2 py-2">

                    {/* Avatar + name → opens workspace switcher */}
                    <button
                        className="flex items-center gap-2 flex-1 min-w-0 rounded hover:bg-bg2 px-1 py-1 transition-colors cursor-pointer"
                        onClick={() => { setWsSwitcherOpen((v) => !v); setWsMenuOpen(false); }}
                        title="Switch workspace"
                        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    >
                        <span
                            className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 select-none"
                            style={{ background: "var(--c-accent)", color: "var(--c-bg0)" }}
                        >
                            {wsInitials(activeWs?.name ?? "")}
                        </span>
                        <span className="text-xs text-text-base font-medium truncate flex-1 text-left">
                            {activeWs?.name ?? "Workspace"}
                        </span>
                    </button>

                    {/* Three-dot menu */}
                    <div ref={menuRef} className="relative flex-shrink-0">
                        <button
                            className="w-6 h-6 flex items-center justify-center rounded text-text-dim hover:text-text-base hover:bg-bg2 transition-colors cursor-pointer"
                            onClick={() => { setWsMenuOpen((v) => !v); setWsSwitcherOpen(false); }}
                            title="Workspace options"
                            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                        >
                            <MoreHorizontal size={14} />
                        </button>

                        {wsMenuOpen && (
                            <div className="absolute bottom-full right-0 mb-1 z-50 bg-bg2 border border-border rounded-md shadow-2xl py-1 min-w-[170px] animate-scale-in">
                                <button
                                    className="w-full text-left px-3 py-1.5 text-xs text-text-base hover:bg-bg3 cursor-pointer transition-colors flex items-center gap-2"
                                    onClick={() => { onPanelSelect("workspace"); setWsMenuOpen(false); }}
                                >
                                    <Settings size={12} className="text-text-dim flex-shrink-0" />
                                    Workspace Settings
                                </button>
                                <button
                                    className="w-full text-left px-3 py-1.5 text-xs text-text-base hover:bg-bg3 cursor-pointer transition-colors flex items-center gap-2"
                                    onClick={() => { onPanelSelect("audit"); setWsMenuOpen(false); }}
                                >
                                    <ClipboardList size={12} className="text-text-dim flex-shrink-0" />
                                    Audit Log
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Workspace switcher dropdown — opens upward */}
                {wsSwitcherOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => { setWsSwitcherOpen(false); setRenamingId(null); setConfirmDeleteId(null); }}
                        />
                        <div
                            ref={switcherRef}
                            className="absolute bottom-full left-0 right-0 z-50 bg-bg2 border border-border rounded-md shadow-2xl py-1 animate-scale-in"
                        >
                            <button
                                onClick={() => { onWorkspaceCreate(); setWsSwitcherOpen(false); }}
                                className="w-full text-left px-3 py-1.5 text-xs text-accent hover:bg-bg3 cursor-pointer transition-colors flex items-center gap-1.5 border-b border-border/60"
                            >
                                <Plus size={12} />
                                Create Workspace
                            </button>

                            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                                Workspaces
                            </div>

                            {workspaces.map((ws) => {
                                const isConfirming = confirmDeleteId === ws.id;
                                return (
                                    <div key={ws.id}>
                                        <div
                                            className={`group flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-bg3 ${activeWorkspaceId === ws.id ? "text-accent font-semibold" : "text-text-base"}`}
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
                                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeWorkspaceId === ws.id ? "bg-accent" : "bg-text-dim/30"}`}
                                                style={{ boxShadow: activeWorkspaceId === ws.id ? "0 0 4px var(--c-accent)" : "none" }}
                                            />
                                            {renamingId === ws.id ? (
                                                <input
                                                    ref={renameRef}
                                                    className="flex-1 min-w-0 bg-bg3 border border-accent/40 rounded px-1.5 py-0.5 text-xs text-text-bright outline-none"
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
                                                        className="text-text-dim hover:text-accent text-[10px] px-1 py-0.5 rounded transition-colors cursor-pointer"
                                                        title="Rename workspace"
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
                                                            className="text-text-dim hover:text-red text-[10px] px-1 py-0.5 rounded transition-colors cursor-pointer"
                                                            title="Delete workspace"
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
                                                className="mx-3 mb-1.5 px-2.5 py-2 rounded border border-red/30 bg-red/5"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <p className="text-[10px] text-text-dim leading-snug mb-2">
                                                    Delete <span className="font-semibold text-text-base">"{ws.name}"</span>? All data in this workspace will be permanently removed.
                                                </p>
                                                <div className="flex gap-1.5">
                                                    <button
                                                        onClick={() => handleDeleteConfirm(ws.id)}
                                                        className="flex-1 px-2 py-1 rounded bg-red/15 border border-red/40 text-red text-[10px] font-semibold hover:bg-red/25 cursor-pointer transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="flex-1 px-2 py-1 rounded bg-bg3 border border-border text-text-dim text-[10px] hover:text-text-base cursor-pointer transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
