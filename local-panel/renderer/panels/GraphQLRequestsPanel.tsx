import React, { useState, useMemo, useCallback } from "react";
import { AppConfig, SavedGraphQLRequest, Folder, Environment } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import FolderTree, { FolderTreeItem } from "@/components/sidebar/FolderTree";
import GraphQLTab from "@/components/graphql/GraphQLTab";
import DraftsFolder from "@/components/sidebar/DraftsFolder";
import { loadDraft } from "@/lib/useDraftPersist";
import { useEntityTabs } from "@/lib/useEntityTabs";
import { Braces } from "@/lib/icons";
import TabBar from "@/components/editor/TabBar";
import { SidebarLayout, SidebarHeader } from "@/components/ui";


// ── Draft tab prefix ───────────────────────────────────────────────────────

const DRAFT_PREFIX = "gql-req-draft-";

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
    config: AppConfig;
    onConfigChange: (cfg: AppConfig) => Promise<void>;
    activeEnv?: Environment | null;
}

// ── GraphQLRequestsPanel ───────────────────────────────────────────────────

export default function GraphQLRequestsPanel({ config, onConfigChange, activeEnv = null }: Props) {
    const requests = config.graphqlRequests ?? [];
    const folders = config.graphqlRequestFolders ?? [];


    const [search, setSearch] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const {
        openTabs, activeTab, setActiveTab,
        loadedEntities, setLoadedEntities,
        tabRefs, isDraft,
        openTab, openNewTab, closeTab, replaceTab,
    } = useEntityTabs<SavedGraphQLRequest>({
        storageKey: "graphqlRequests",
        draftPrefix: DRAFT_PREFIX,
        extraDraftPrefixes: [],
        workspaceId: config.activeWorkspaceId,
        entityKind: "graphqlRequests" as any,
        entities: requests,
    });

    const reloadConfig = useCallback(async () => {
        const fresh = await window.api.getConfig();
        await onConfigChange(fresh);
    }, [onConfigChange]);

    const handleFoldersChange = useCallback(async () => {
        await reloadConfig();
    }, [reloadConfig]);

    const handleNewSave = useCallback(async (tabId: string, data: Omit<SavedGraphQLRequest, "id" | "createdAt" | "workspaceId">) => {
        const created = await window.api.addGraphQLRequest(data);
        await reloadConfig();
        replaceTab(tabId, created.id);
    }, [reloadConfig, replaceTab]);

    const handleTabSave = useCallback(async (tabId: string, data: Omit<SavedGraphQLRequest, "id" | "createdAt" | "workspaceId">) => {
        const req = loadedEntities[tabId] ?? requests.find((r) => r.id === tabId);
        if (!req) return;
        const updated = { ...req, ...data };
        setLoadedEntities((prev) => ({ ...prev, [tabId]: updated }));
        await window.api.updateGraphQLRequest(updated);
        await reloadConfig();
    }, [loadedEntities, requests, reloadConfig]);

    const handleDelete = useCallback(async (id: string) => {
        await window.api.deleteGraphQLRequest(id);
        await reloadConfig();
        closeTab(id);
    }, [reloadConfig, closeTab]);

    const handleDuplicate = useCallback(async (id: string) => {
        let r = loadedEntities[id];
        if (!r) {
            const res = await window.api.loadEntity(config.activeWorkspaceId, "graphqlRequests", id);
            if (res.ok && res.entity) r = res.entity as SavedGraphQLRequest;
        }
        if (!r) return;
        const { id: _id, createdAt: _ca, workspaceId: _ws, ...rest } = r;
        await window.api.addGraphQLRequest({ ...rest, name: r.name ? `${r.name} (copy)` : "" });
        await reloadConfig();
    }, [loadedEntities, config.activeWorkspaceId, reloadConfig]);

    const handleMoveItems = useCallback(async (ids: string[], folderId: string | null) => {
        for (const id of ids) {
            let r = loadedEntities[id];
            if (!r) {
                const res = await window.api.loadEntity(config.activeWorkspaceId, "graphqlRequests", id);
                if (res.ok && res.entity) r = res.entity as SavedGraphQLRequest;
            }
            if (r) await window.api.updateGraphQLRequest({ ...r, folderId: folderId ?? undefined } as any);
        }
        await reloadConfig();
    }, [loadedEntities, config.activeWorkspaceId, reloadConfig]);

    const filteredRequests = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return requests;
        return requests.filter((r) => r.name.toLowerCase().includes(q) || r.endpointUrl.toLowerCase().includes(q));
    }, [requests, search]);

    const draftTabIds = openTabs.filter(isDraft);

    const tabLabel = (tabId: string) => {
        if (isDraft(tabId)) {
            const draft = loadDraft<{ name?: string; endpointUrl?: string }>(tabId);
            if (draft?.name) return draft.name;
            if (draft?.endpointUrl) return draft.endpointUrl.slice(0, 30);
            return "New GraphQL Request";
        }
        const r = requests.find((x) => x.id === tabId);
        if (!r) return "…";
        return r.name || r.endpointUrl?.slice(0, 30) || "Untitled";
    };

    const folderViewItems: FolderTreeItem[] = useMemo(() => {
        return filteredRequests.map((r): FolderTreeItem => ({
            id: r.id,
            name: r.name || r.endpointUrl?.slice(0, 40) || "Untitled",
            folderId: r.folderId ?? null,
            isActive: activeTab === r.id,
            isEnabled: true,
        }));
    }, [filteredRequests, activeTab]);

    // ── Sidebar ────────────────────────────────────────────────────────────

    const sidebarContent = (
        <>
            <SidebarHeader onCollapse={() => setSidebarOpen(false)} collapseTitle="Collapse sidebar">
                <SearchInput value={search} onChange={setSearch} placeholder="Search requests…" />
            </SidebarHeader>
            <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0" style={{ display: "flex", flexDirection: "column" }}>
                {draftTabIds.length > 0 && (
                    <DraftsFolder
                        label="Drafts"
                        draftTabIds={draftTabIds}
                        activeTab={activeTab}
                        onOpenTab={(id) => setActiveTab(id)}
                        onCloseTab={closeTab}
                        tabLabel={tabLabel}
                    />
                )}
                <FolderTree
                    kind="graphqlRequest"
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
                newTabTitle="New GraphQL request"
                closeTabTitle="Close tab"
            />

            <div className="flex-1 overflow-hidden relative">
                {openTabs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                        <div className="opacity-10 mb-1"><Braces size={48} /></div>
                        <div className="text-sm font-medium text-text-base">No GraphQL requests open</div>
                        <p className="text-xs text-text-dim max-w-xs leading-relaxed">
                            Send GraphQL queries and mutations. Import a schema or use server introspection to get started.
                        </p>
                    </div>
                ) : (
                    openTabs.map((tabId) => {
                        const isUnsaved = isDraft(tabId);
                        const req = isUnsaved ? null : (loadedEntities[tabId] ?? requests.find((r) => r.id === tabId) ?? null);
                        const initialData = isUnsaved ? null : req;
                        if (!isUnsaved && !req) return null;
                        return (
                            <div key={tabId} className="absolute inset-0 flex flex-col overflow-hidden" style={{ display: activeTab === tabId ? "flex" : "none" }}>
                                <GraphQLTab
                                    ref={(el) => { tabRefs.current[tabId] = el as any; }}
                                    tabType="request"
                                    tabId={tabId}
                                    draftTabId={isUnsaved ? tabId : null}
                                    initial={initialData}
                                    folders={folders}
                                    activeEnv={activeEnv}
                                    onSave={(data) => isUnsaved
                                        ? handleNewSave(tabId, data as Omit<SavedGraphQLRequest, "id" | "createdAt" | "workspaceId">)
                                        : handleTabSave(tabId, data as Omit<SavedGraphQLRequest, "id" | "createdAt" | "workspaceId">)
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
                collapseTitle="Collapse sidebar"
                expandTitle="Expand sidebar"
                collapsedBadge={requests.length > 0 ? (
                    <span className="text-[9px] text-text-dim font-mono" title={`${requests.length} requests`}
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1.4 }}>{requests.length}</span>
                ) : undefined}
            >
                {mainContent}
            </SidebarLayout>
        </>
    );
}
