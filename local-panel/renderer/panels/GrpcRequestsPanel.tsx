import React, { useState, useMemo, useCallback } from "react";
import { AppConfig, SavedGrpcRequest, Folder, Environment } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import FolderTree, { FolderTreeItem } from "@/components/sidebar/FolderTree";
import GrpcTab from "@/components/grpc/GrpcTab";
import DraftsFolder from "@/components/sidebar/DraftsFolder";
import { loadDraft } from "@/lib/useDraftPersist";
import { useEntityTabs } from "@/lib/useEntityTabs";
import { Network } from "@/lib/icons";
import TabBar from "@/components/editor/TabBar";
import { SidebarLayout, SidebarHeader } from "@/components/ui";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { strings } from "@/lib/strings";

import { GrpcRequestDraft } from "@/components/grpc/grpcTabReducer";

// ── Constants ──────────────────────────────────────────────────────────────

const DRAFT_PREFIX = "grpc-req-draft-";
const isDraft = (id: string) => id.startsWith(DRAFT_PREFIX);

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
    config: AppConfig;
    onConfigChange: (cfg: AppConfig) => Promise<void>;
    activeEnv?: Environment | null;
}

// ── GrpcRequestsPanel ──────────────────────────────────────────────────

export default function GrpcRequestsPanel({ config, onConfigChange, activeEnv = null }: Props) {
    const requests = config.grpcRequests ?? [];
    const folders = config.grpcRequestFolders ?? [];

    const { confirm, ConfirmDialogElement } = useConfirmDialog();

    const [search, setSearch] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const {
        openTabs, activeTab, setActiveTab,
        loadedEntities, setLoadedEntities,
        openTab, openNewTab, closeTab, replaceTab, closeOtherTabs, closeAllTabs,
    } = useEntityTabs<SavedGrpcRequest>({
        storageKey: "grpcRequests",
        draftPrefix: DRAFT_PREFIX,
        workspaceId: config.activeWorkspaceId,
        entityKind: "grpcRequests" as any,
        entities: requests,
    });

    const reloadConfig = useCallback(async () => {
        const fresh = await window.api.getConfig();
        await onConfigChange(fresh);
    }, [onConfigChange]);

    const handleNewSave = useCallback(async (tabId: string, data: Omit<SavedGrpcRequest, "id" | "createdAt" | "workspaceId">) => {
        const created = await window.api.addGrpcRequest(data);
        await reloadConfig();
        replaceTab(tabId, created.id);
    }, [reloadConfig, replaceTab]);

    const handleTabSave = useCallback(async (tabId: string, data: Omit<SavedGrpcRequest, "id" | "createdAt" | "workspaceId">) => {
        const req = loadedEntities[tabId] ?? requests.find((r) => r.id === tabId);
        if (!req) return;
        const updated = { ...req, ...data };
        setLoadedEntities((prev) => ({ ...prev, [tabId]: updated }));
        await window.api.updateGrpcRequest(updated);
        await reloadConfig();
    }, [loadedEntities, requests, reloadConfig]);

    const handleDelete = useCallback(async (id: string) => {
        const ok = await confirm(strings.grpc.deleteRequestConfirm);
        if (!ok) return;
        await window.api.deleteGrpcRequest(id);
        await reloadConfig();
        closeTab(id);
    }, [confirm, reloadConfig, closeTab]);

    const handleDuplicate = useCallback(async (id: string) => {
        let r = loadedEntities[id];
        if (!r) {
            const res = await window.api.loadEntity(config.activeWorkspaceId, "grpcRequests", id);
            if (res.ok && res.entity) r = res.entity as SavedGrpcRequest;
        }
        if (!r) return;
        const { id: _id, createdAt: _ca, workspaceId: _ws, ...rest } = r;
        await window.api.addGrpcRequest({ ...rest, name: r.name ? strings.grpc.copySuffix.replace("{name}", r.name) : "" });
        await reloadConfig();
    }, [loadedEntities, config.activeWorkspaceId, reloadConfig]);

    const handleFoldersChange = useCallback(async () => {
        await reloadConfig();
    }, [reloadConfig]);

    const handleMoveItems = useCallback(async (ids: string[], folderId: string | null) => {
        for (const id of ids) {
            let r = loadedEntities[id];
            if (!r) {
                const res = await window.api.loadEntity(config.activeWorkspaceId, "grpcRequests", id);
                if (res.ok && res.entity) r = res.entity as SavedGrpcRequest;
            }
            if (r) await window.api.updateGrpcRequest({ ...r, folderId: folderId ?? undefined } as any);
        }
        await reloadConfig();
    }, [loadedEntities, config.activeWorkspaceId, reloadConfig]);

    const tabLabel = (tabId: string): string => {
        if (isDraft(tabId)) {
            const draft = loadDraft<GrpcRequestDraft>(tabId);
            if (draft?.serviceName && draft?.methodName) return `${draft.serviceName}/${draft.methodName}`;
            if (draft?.serviceName) return draft.serviceName;
            return strings.grpc.newRequestTab;
        }
        const r = requests.find((x) => x.id === tabId);
        if (!r) return "…";
        if (r.name) return r.name;
        if (r.serviceName && r.methodName) return `${r.serviceName}/${r.methodName}`;
        return r.serviceName || strings.grpc.requestLabel;
    };

    const folderViewItems: FolderTreeItem[] = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
            ? requests.filter((r) => r.name.toLowerCase().includes(q) || r.serviceName.toLowerCase().includes(q) || r.methodName.toLowerCase().includes(q))
            : requests;
        return filtered.map((r): FolderTreeItem => ({
            id: r.id,
            name: r.name || `${r.serviceName}/${r.methodName}` || strings.grpc.unnamed,
            folderId: r.folderId ?? null,
            isActive: activeTab === r.id,
            isEnabled: true,
        }));
    }, [requests, search, activeTab]);

    const draftTabIds = openTabs.filter(isDraft);

    // ── Sidebar ────────────────────────────────────────────────────────────

    const sidebarContent = (
        <>
            <SidebarHeader onCollapse={() => setSidebarOpen(false)} collapseTitle={strings.grpc.collapseSidebar}>
                <SearchInput value={search} onChange={setSearch} placeholder={strings.grpc.searchRequests} />
            </SidebarHeader>
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
                    kind="grpcRequest"
                    folders={folders}
                    items={folderViewItems}
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
                newTabTitle={strings.grpc.newRequestTabTitle}
                closeTabTitle={strings.grpc.closeTab}
                onCloseOthers={closeOtherTabs}
                onCloseAll={closeAllTabs}
                onTabDuplicate={handleDuplicate}
            />

            <div className="flex-1 overflow-hidden relative">
                {openTabs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                        <div className="opacity-10 mb-1"><Network size={48} /></div>
                        <div className="text-sm font-medium text-text-base">{strings.grpc.noRequestsOpen}</div>
                        <p className="text-xs text-text-dim max-w-xs leading-relaxed">
                            {strings.grpc.noRequestsOpenHint}
                        </p>
                    </div>
                ) : (
                    openTabs.map((tabId) => {
                        const isUnsaved = isDraft(tabId);
                        const req = isUnsaved ? null : (loadedEntities[tabId] ?? requests.find((r) => r.id === tabId) ?? null);
                        if (!isUnsaved && !req) return null;
                        return (
                            <div key={tabId} className="absolute inset-0 flex flex-col overflow-hidden" style={{ display: activeTab === tabId ? "flex" : "none" }}>
                                <GrpcTab
                                    tabType="request"
                                    tabId={tabId}
                                    draftTabId={isUnsaved ? tabId : null}
                                    initial={req}
                                    folders={folders}
                                    activeEnv={activeEnv}
                                    onSave={(data) => isUnsaved
                                        ? handleNewSave(tabId, data as Omit<SavedGrpcRequest, "id" | "createdAt" | "workspaceId">)
                                        : handleTabSave(tabId, data as Omit<SavedGrpcRequest, "id" | "createdAt" | "workspaceId">)
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
                storageKey="grpc-requests-panel-sidebar"
                collapsedBadge={requests.length > 0 ? (
                    <span className="text-[9px] text-text-dim font-mono" title={strings.grpc.requestCount.replace("{count}", String(requests.length))}
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1.4 }}>{requests.length}</span>
                ) : undefined}
            >
                {mainContent}
            </SidebarLayout>
            {ConfirmDialogElement}
        </>
    );
}
