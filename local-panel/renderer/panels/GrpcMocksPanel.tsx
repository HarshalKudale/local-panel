import React, { useState, useMemo, useCallback, useEffect } from "react";
import { AppConfig, SavedGrpcMock, Folder, Environment } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import FolderTree, { FolderTreeItem } from "@/components/sidebar/FolderTree";
import GrpcTab from "@/components/grpc/GrpcTab";
import DraftsFolder from "@/components/sidebar/DraftsFolder";
import { loadDraft } from "@/lib/useDraftPersist";
import { useEntityTabs } from "@/lib/useEntityTabs";
import { calculateFolderStatus } from "@/lib/utils";
import { Network, Play, Square } from "@/lib/icons";
import TabBar from "@/components/editor/TabBar";
import { SidebarLayout, SidebarHeader } from "@/components/ui";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { strings } from "@/lib/strings";

import { GrpcMockDraft } from "@/components/grpc/grpcTabReducer";

// ── Constants ──────────────────────────────────────────────────────────────

const DRAFT_PREFIX = "grpc-mock-draft-";
const isDraft = (id: string) => id.startsWith(DRAFT_PREFIX);

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
    config: AppConfig;
    onConfigChange: (cfg: AppConfig) => Promise<void>;
    activeEnv?: Environment | null;
}

// ── GrpcMocksPanel ─────────────────────────────────────────────────────

export default function GrpcMocksPanel({ config, onConfigChange, activeEnv = null }: Props) {
    const mocks = config.grpcMocks ?? [];
    const folders = config.grpcMockFolders ?? [];

    const { confirm, ConfirmDialogElement } = useConfirmDialog();

    const [search, setSearch] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mockServerRunning, setMockServerRunning] = useState(false);
    const [mockServerPort, setMockServerPort] = useState(config.grpcMockServerPort ?? 9102);
    const [serverBusy, setServerBusy] = useState(false);

    // Check mock server status on mount
    useEffect(() => {
        window.api.grpcMockServerStatus().then((s) => {
            setMockServerRunning(s.running);
            setMockServerPort(s.port);
        });
    }, []);

    const toggleMockServer = useCallback(async () => {
        setServerBusy(true);
        try {
            if (mockServerRunning) {
                await window.api.grpcStopMockServer();
                setMockServerRunning(false);
            } else {
                const res = await window.api.grpcStartMockServer();
                if (res.ok) setMockServerRunning(true);
            }
        } finally {
            setServerBusy(false);
        }
    }, [mockServerRunning]);

    const {
        openTabs, activeTab, setActiveTab,
        loadedEntities, setLoadedEntities,
        openTab, openNewTab, closeTab, replaceTab, closeOtherTabs, closeAllTabs,
    } = useEntityTabs<SavedGrpcMock>({
        storageKey: "grpcMocks",
        draftPrefix: DRAFT_PREFIX,
        workspaceId: config.activeWorkspaceId,
        entityKind: "grpcMocks" as any,
        entities: mocks,
    });

    const reloadConfig = useCallback(async () => {
        const fresh = await window.api.getConfig();
        await onConfigChange(fresh);
    }, [onConfigChange]);

    const handleNewSave = useCallback(async (tabId: string, data: Omit<SavedGrpcMock, "id" | "createdAt" | "workspaceId">) => {
        const created = await window.api.addGrpcMock(data);
        await reloadConfig();
        replaceTab(tabId, created.id);
    }, [reloadConfig, replaceTab]);

    const handleTabSave = useCallback(async (tabId: string, data: Omit<SavedGrpcMock, "id" | "createdAt" | "workspaceId">) => {
        const mock = loadedEntities[tabId] ?? mocks.find((m) => m.id === tabId);
        if (!mock) return;
        const updated = { ...mock, ...data };
        setLoadedEntities((prev) => ({ ...prev, [tabId]: updated }));
        await window.api.updateGrpcMock(updated);
        await reloadConfig();
    }, [loadedEntities, mocks, reloadConfig]);

    const handleDelete = useCallback(async (id: string) => {
        const ok = await confirm(strings.grpc.deleteMockConfirm);
        if (!ok) return;
        await window.api.deleteGrpcMock(id);
        await reloadConfig();
        closeTab(id);
    }, [confirm, reloadConfig, closeTab]);

    const handleDuplicate = useCallback(async (id: string) => {
        let m = loadedEntities[id];
        if (!m) {
            const res = await window.api.loadEntity(config.activeWorkspaceId, "grpcMocks", id);
            if (res.ok && res.entity) m = res.entity as SavedGrpcMock;
        }
        if (!m) return;
        const { id: _id, createdAt: _ca, workspaceId: _ws, ...rest } = m;
        await window.api.addGrpcMock({ ...rest, name: m.name ? strings.grpc.copySuffix.replace("{name}", m.name) : "" });
        await reloadConfig();
    }, [loadedEntities, config.activeWorkspaceId, reloadConfig]);

    const handleFoldersChange = useCallback(async () => {
        await reloadConfig();
    }, [reloadConfig]);

    const handleMoveItems = useCallback(async (ids: string[], folderId: string | null) => {
        for (const id of ids) {
            let m = loadedEntities[id];
            if (!m) {
                const res = await window.api.loadEntity(config.activeWorkspaceId, "grpcMocks", id);
                if (res.ok && res.entity) m = res.entity as SavedGrpcMock;
            }
            if (m) await window.api.updateGrpcMock({ ...m, folderId: folderId ?? undefined } as any);
        }
        await reloadConfig();
    }, [loadedEntities, config.activeWorkspaceId, reloadConfig]);

    const tabLabel = (tabId: string): string => {
        if (isDraft(tabId)) {
            const draft = loadDraft<GrpcMockDraft>(tabId);
            if (draft?.serviceName && draft?.methodName) return `${draft.serviceName}/${draft.methodName}`;
            if (draft?.serviceName) return draft.serviceName;
            return strings.grpc.newMockTab;
        }
        const m = mocks.find((x) => x.id === tabId);
        if (!m) return "…";
        if (m.name) return m.name;
        if (m.serviceName && m.methodName) return `${m.serviceName}/${m.methodName}`;
        return m.serviceName || strings.grpc.mockLabel;
    };

    const folderViewItems: FolderTreeItem[] = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
            ? mocks.filter((m) => m.name.toLowerCase().includes(q) || m.serviceName.toLowerCase().includes(q) || m.methodName.toLowerCase().includes(q))
            : mocks;
        return filtered.map((m): FolderTreeItem => ({
            id: m.id,
            name: m.name || `${m.serviceName}/${m.methodName}` || strings.grpc.unnamed,
            folderId: m.folderId ?? null,
            isActive: activeTab === m.id,
            isEnabled: m.enabled,
        }));
    }, [mocks, search, activeTab]);

    const folderStatusMap = useMemo(() => calculateFolderStatus(mocks, folders), [mocks, folders]);

    const draftTabIds = openTabs.filter(isDraft);

    // ── Sidebar ────────────────────────────────────────────────────────────

    const sidebarContent = (
        <>
            <SidebarHeader onCollapse={() => setSidebarOpen(false)} collapseTitle={strings.grpc.collapseSidebar}>
                <SearchInput value={search} onChange={setSearch} placeholder={strings.grpc.searchMocks} />
            </SidebarHeader>
            {/* Mock server toggle */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <button
                    onClick={toggleMockServer}
                    disabled={serverBusy}
                    className={`flex items-center justify-center w-6 h-6 rounded border transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${mockServerRunning
                        ? "border-green/40 bg-green/10 hover:bg-red/15 hover:border-red/40 text-green hover:text-red"
                        : "border-border bg-bg2 hover:bg-green/15 hover:border-green/40 text-text-dim hover:text-green"
                        }`}
                    title={mockServerRunning ? strings.grpc.stopMockServer : strings.grpc.startMockServer}
                >
                    {serverBusy ? (
                        <span className="inline-block w-2.5 h-2.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    ) : mockServerRunning ? (
                        <Square size={8} fill="currentColor" />
                    ) : (
                        <Play size={8} fill="currentColor" />
                    )}
                </button>
                <span className="text-[10px] text-text-dim">
                    {mockServerRunning ? strings.grpc.mockServerRunning.replace("{port}", String(mockServerPort)) : strings.grpc.mockServerStopped}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0" style={{ display: "flex", flexDirection: "column" }}>
                {draftTabIds.length > 0 && (
                    <DraftsFolder
                        label={strings.grpc.drafts}
                        draftTabIds={draftTabIds}
                        activeTab={activeTab}
                        onOpenTab={(id) => setActiveTab(id)}
                        onCloseTab={closeTab}
                        tabLabel={tabLabel}
                    />
                )}
                <FolderTree
                    kind="grpcMock"
                    folders={folders}
                    items={folderViewItems}
                    folderStatusMap={folderStatusMap}
                    onOpenItem={openTab}
                    onDeleteItem={handleDelete}
                    onFoldersChange={handleFoldersChange}
                    onDuplicateItem={handleDuplicate}
                    onMoveItems={handleMoveItems}
                    onOpenNewTab={openNewTab}
                    onBeforeCreateFolder={() => true}
                />
            </div>
        </>
    );

    // ── Main content ───────────────────────────────────────────────────────

    const mainContent = (
        <div className="flex flex-col flex-1 overflow-hidden min-w-0 h-full">
            <TabBar
                tabs={openTabs.map((id) => ({ id, label: tabLabel(id), isDraft: isDraft(id) }))}
                activeTab={activeTab}
                onTabClick={setActiveTab}
                onTabClose={closeTab}
                onNewTab={openNewTab}
                newTabTitle={strings.grpc.newMockTabTitle}
                closeTabTitle={strings.grpc.closeTab}
                onCloseOthers={closeOtherTabs}
                onCloseAll={closeAllTabs}
                onTabDuplicate={handleDuplicate}
            />

            <div className="flex-1 overflow-hidden relative">
                {openTabs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                        <div className="opacity-10 mb-1"><Network size={48} /></div>
                        <div className="text-sm font-medium text-text-base">{strings.grpc.noMocksOpen}</div>
                        <p className="text-xs text-text-dim max-w-xs leading-relaxed">
                            {strings.grpc.noMocksOpenHint}
                        </p>
                    </div>
                ) : (
                    openTabs.map((tabId) => {
                        const isUnsaved = isDraft(tabId);
                        const mock = isUnsaved ? null : (loadedEntities[tabId] ?? mocks.find((m) => m.id === tabId) ?? null);
                        if (!isUnsaved && !mock) return null;
                        return (
                            <div key={tabId} className="absolute inset-0 flex flex-col overflow-hidden" style={{ display: activeTab === tabId ? "flex" : "none" }}>
                                <GrpcTab
                                    tabType="mock"
                                    tabId={tabId}
                                    draftTabId={isUnsaved ? tabId : null}
                                    initial={mock}
                                    folders={folders}
                                    activeEnv={activeEnv}
                                    onSave={(data) => isUnsaved
                                        ? handleNewSave(tabId, data as Omit<SavedGrpcMock, "id" | "createdAt" | "workspaceId">)
                                        : handleTabSave(tabId, data as Omit<SavedGrpcMock, "id" | "createdAt" | "workspaceId">)
                                    }
                                    onClose={() => closeTab(tabId)}
                                />
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <>
            <SidebarLayout
                sidebarOpen={sidebarOpen}
                onToggle={() => setSidebarOpen(true)}
                sidebar={sidebarContent}
                collapseTitle={strings.grpc.collapseSidebar}
                expandTitle={strings.grpc.expandSidebar}
                storageKey="grpc-mocks-panel-sidebar"
                collapsedBadge={mocks.length > 0 ? (
                    <span className="text-[9px] text-text-dim font-mono" title={strings.grpc.mockCount.replace("{count}", String(mocks.length))}
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1.4 }}>{mocks.length}</span>
                ) : undefined}
            >
                {mainContent}
            </SidebarLayout>
            {ConfirmDialogElement}
        </>
    );
}
