import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AppConfig } from "@/types";
import type { RunnerConfig, RunnerProcessState } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import FolderTree, { FolderTreeItem } from "@/components/sidebar/FolderTree";
import DraftsFolder from "@/components/sidebar/DraftsFolder";
import TabBar from "@/components/editor/TabBar";
import { SidebarLayout, SidebarHeader, EmptyState, Button } from "@/components/ui";
import { useEntityTabs } from "@/lib/useEntityTabs";
import { useTabKeyBindings } from "@/hooks/useTabKeyBindings";
import { strings } from "@/lib/strings";
import { Plus, Terminal } from "@/lib/icons";
import RunnerTab from "@/components/runner/RunnerTab";
import type { RunnerTabHandle } from "@/components/runner/RunnerTab";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { usePersistedState } from "@/lib/usePersistedState";
import { useRef } from "react";

// -- Draft tab prefix -------------------------------------------------------

const DRAFT_PREFIX = "runner-draft-";
const isDraft = (id: string) => id.startsWith(DRAFT_PREFIX);

// -- Props ------------------------------------------------------------------

interface Props {
    config: AppConfig;
    onConfigChange: (cfg: AppConfig) => Promise<void>;
}

// -- RunnerPanel ------------------------------------------------------------

export default function RunnerPanel({ config, onConfigChange }: Props) {
    const s = strings.runner;
    const wsId = config.activeWorkspaceId;
    const folders = config.runnerFolders ?? [];

    const [runners, setRunners] = useState<RunnerConfig[]>([]);
    const [search, setSearch] = usePersistedState(`runner:${wsId}:search`, "");
    const [sidebarOpen, setSidebarOpen] = usePersistedState(`runner:${wsId}:sidebar-open`, true);
    const [selectedFolderId, setSelectedFolderId] = usePersistedState<string | null>(`runner:${wsId}:selected-folder`, null);
    const [processStates, setProcessStates] = useState<Record<string, RunnerProcessState>>({});
    const [dirtyTabs, setDirtyTabs] = useState<Record<string, boolean>>({});
    const tabRefs = useRef<Record<string, RunnerTabHandle | null>>({});

    const { confirm, ConfirmDialogElement } = useConfirmDialog();

    // Load runners on mount / workspace change
    const loadRunners = useCallback(async () => {
        try {
            const list = await window.api.listRunners(wsId) as RunnerConfig[];
            setRunners(list ?? []);
        } catch { }
    }, [wsId]);

    useEffect(() => { loadRunners(); }, [loadRunners]);

    // Load all process states on mount
    useEffect(() => {
        window.api.getAllRunnerStates().then((states: RunnerProcessState[]) => {
            const map: Record<string, RunnerProcessState> = {};
            for (const s of (states ?? [])) map[s.runnerId] = s;
            setProcessStates(map);
        }).catch(() => {});

        const unsub = window.api.onRunnerStatusChange((raw: unknown) => {
            const state = raw as RunnerProcessState;
            setProcessStates((prev) => ({ ...prev, [state.runnerId]: state }));
        });
        return () => unsub();
    }, []);

    // Reload config (for folder updates)
    const reloadConfig = useCallback(async () => {
        const fresh = await window.api.getConfig();
        await onConfigChange(fresh);
    }, [onConfigChange]);

    // Entity tabs
    const {
        openTabs, activeTab, setActiveTab,
        isDraft: isTabDraft,
        openTab, openNewTab, closeTab, closeOtherTabs, closeAllTabs, replaceTab,
    } = useEntityTabs<RunnerConfig>({
        storageKey: "runners",
        draftPrefix: DRAFT_PREFIX,
        workspaceId: wsId,
        entityKind: "runners",
        entities: runners,
    });

    const openNewTabInFolder = useCallback(() => {
        const tabId = `${DRAFT_PREFIX}${Date.now()}`;
        openTab(tabId);
    }, [openTab]);

    useTabKeyBindings({ activeTab, tabRefs, closeTab, openNewTab: openNewTabInFolder });

    // Handlers
    const handleSaved = useCallback(async (saved: RunnerConfig, fromTabId: string) => {
        await loadRunners();
        if (isDraft(fromTabId)) replaceTab(fromTabId, saved.id);
        else openTab(saved.id);
    }, [loadRunners, replaceTab, openTab]);

    const handleDelete = useCallback(async (id: string) => {
        const ok = await confirm(s.confirmDelete);
        if (!ok) return;
        closeTab(id);
        await window.api.deleteRunner(wsId, id);
        await loadRunners();
    }, [wsId, closeTab, loadRunners, confirm, s.confirmDelete]);

    const handleFoldersChange = useCallback(async () => {
        await reloadConfig();
    }, [reloadConfig]);

    const handleMoveFolder = useCallback(async (folderId: string, targetParentId: string | null) => {
        await window.api.moveFolder("runner", folderId, targetParentId);
        await handleFoldersChange();
    }, [handleFoldersChange]);

    const handleMoveItems = useCallback(async (ids: string[], folderId: string | null) => {
        for (const id of ids) {
            const r = runners.find((x) => x.id === id);
            if (r) await window.api.saveRunner({ ...r, folderId: folderId ?? undefined });
        }
        await loadRunners();
    }, [runners, loadRunners]);

    const handleBeforeDeleteFolder = useCallback((folderId: string) => {
        runners.filter((r) => r.folderId === folderId).forEach((r) => closeTab(r.id));
    }, [runners, closeTab]);

    const handleRunFolder = useCallback(async (folderId: string) => {
        const inFolder = runners.filter((r) => r.folderId === folderId);
        for (const r of inFolder) {
            await window.api.startRunner(wsId, r.id);
        }
    }, [runners, wsId]);

    const handleStopFolder = useCallback(async (folderId: string) => {
        const inFolder = runners.filter((r) => r.folderId === folderId);
        for (const r of inFolder) {
            const state = processStates[r.id];
            if (state && (state.status === "running" || state.status === "starting")) {
                await window.api.stopRunner(r.id);
            }
        }
    }, [runners, processStates]);

    const handleStartItem = useCallback(async (id: string) => {
        await window.api.startRunner(wsId, id);
    }, [wsId]);

    const handleStopItem = useCallback(async (id: string) => {
        await window.api.stopRunner(id);
    }, []);

    // Filtered list
    const filteredRunners = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return runners;
        return runners.filter((r) => r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q));
    }, [runners, search]);

    // Tab label
    const tabLabel = (tabId: string) => {
        if (isDraft(tabId)) return s.newRunner;
        return runners.find((r) => r.id === tabId)?.name ?? "…";
    };

    // Folder tree items
    const folderViewItems: FolderTreeItem[] = useMemo(() => {
        return filteredRunners.map((r): FolderTreeItem => {
            const state = processStates[r.id];
            const isRunning = state?.status === "running";
            return {
                id: r.id,
                name: r.name || r.type,
                folderId: r.folderId ?? null,
                isActive: activeTab === r.id,
                isEnabled: isRunning,
                hideDot: !isRunning,
            };
        });
    }, [filteredRunners, activeTab, processStates]);

    const draftTabIds = openTabs.filter(isDraft);


    // -- Sidebar -----------------------------------------------------------

    const sidebarContent = (
        <>
            <SidebarHeader onCollapse={() => setSidebarOpen(false)} collapseTitle={s.collapseSidebar}>
                <SearchInput value={search} onChange={setSearch} placeholder={s.searchPlaceholder} />
            </SidebarHeader>
            <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0 flex flex-col">
                {draftTabIds.length > 0 && (
                    <DraftsFolder
                        label={s.drafts}
                        draftTabIds={draftTabIds}
                        activeTab={activeTab}
                        onOpenTab={(id) => setActiveTab(id)}
                        onCloseTab={closeTab}
                        tabLabel={tabLabel}
                    />
                )}
                <FolderTree
                    kind="runner"
                    folders={folders}
                    items={folderViewItems}
                    onOpenItem={openTab}
                    onDeleteItem={handleDelete}
                    onFoldersChange={handleFoldersChange}
                    onMoveItems={handleMoveItems}
                    onMoveFolder={handleMoveFolder}
                    onOpenNewTab={openNewTabInFolder}
                    onSelectedFolderChange={setSelectedFolderId}
                    onBeforeCreateFolder={() => true}
                    onBeforeDeleteFolder={handleBeforeDeleteFolder}
                    onOpenRunner={handleRunFolder}
                    onStartItem={handleStartItem}
                    onStopItem={handleStopItem}
                />
            </div>
        </>
    );

    // -- Main content -------------------------------------------------------

    const mainContent = (
        <div className="flex flex-col flex-1 overflow-hidden min-w-0 h-full">
            <TabBar
                tabs={openTabs.map((id) => ({ id, label: tabLabel(id), isDraft: isDraft(id), isModified: dirtyTabs[id] }))}
                activeTab={activeTab}
                onTabClick={setActiveTab}
                onTabClose={closeTab}
                onNewTab={openNewTabInFolder}
                onCloseOthers={closeOtherTabs}
                onCloseAll={closeAllTabs}
            />
            <div className="flex-1 overflow-hidden relative">
                {openTabs.length === 0 ? (
                    <EmptyState
                        icon={<Terminal size={32} />}
                        title={s.noTitle}
                        description={s.noDesc}
                        fill
                        action={
                            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openNewTabInFolder}>
                                {s.addRunner}
                            </Button>
                        }
                    />
                ) : (
                    openTabs.map((tabId) => (
                        <div
                            key={tabId}
                            className="absolute inset-0 flex flex-col overflow-hidden"
                            style={{ display: activeTab === tabId ? "flex" : "none" }}
                        >
                            <RunnerTab
                                ref={(el) => { tabRefs.current[tabId] = el; }}
                                key={tabId}
                                runnerId={tabId}
                                workspaceId={wsId}
                                initial={isDraft(tabId) ? { folderId: selectedFolderId } : runners.find((r) => r.id === tabId)}
                                onSaved={(saved, fromTabId) => handleSaved(saved, fromTabId)}
                                onDelete={handleDelete}
                                onDirtyChange={(dirty) => setDirtyTabs((prev) => ({ ...prev, [tabId]: dirty }))}
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    return (
        <>
            {ConfirmDialogElement}
            <SidebarLayout
                sidebarOpen={sidebarOpen}
                onToggle={() => setSidebarOpen(true)}
                sidebar={sidebarContent}
                storageKey="runner-panel-sidebar"
                collapsedBadge={runners.length > 0 ? (
                    <span
                        className="text-[9px] text-text-dim font-mono"
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1.4 }}
                    >{runners.length}</span>
                ) : undefined}
            >
                {mainContent}
            </SidebarLayout>
        </>
    );
}
