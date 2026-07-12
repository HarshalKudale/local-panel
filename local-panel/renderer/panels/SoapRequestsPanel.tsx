import React, { useState, useMemo, useCallback, useRef } from "react";
import { AppConfig, SavedSoapRequest, Folder, Environment } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import FolderTree, { FolderTreeItem } from "@/components/sidebar/FolderTree";
import SoapTab, { SoapTabHandle } from "@/components/soap/SoapTab";
import DraftsFolder from "@/components/sidebar/DraftsFolder";
import { loadDraft } from "@/lib/useDraftPersist";
import { useEntityTabs } from "@/lib/useEntityTabs";
import { FileCode } from "@/lib/icons";
import TabBar from "@/components/editor/TabBar";
import { SidebarLayout, SidebarHeader } from "@/components/ui";
import { strings } from "@/lib/strings";


// -- Draft tab prefix -------------------------------------------------------

const DRAFT_PREFIX = "soap-req-draft-";
const isDraftCheck = (id: string) => id.startsWith(DRAFT_PREFIX);

// -- Props ------------------------------------------------------------------

interface Props {
    config: AppConfig;
    onConfigChange: (cfg: AppConfig) => Promise<void>;
    activeEnv?: Environment | null;
}

// -- SoapRequestsPanel ------------------------------------------------------

export default function SoapRequestsPanel({ config, onConfigChange, activeEnv = null }: Props) {
    const requests = config.soapRequests ?? [];
    const folders = config.soapRequestFolders ?? [];

    const [search, setSearch] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const {
        openTabs, activeTab, setActiveTab,
        loadedEntities, setLoadedEntities,
        tabRefs, isDraft,
        openTab, openNewTab, closeTab, replaceTab, closeOtherTabs, closeAllTabs,
    } = useEntityTabs<SavedSoapRequest>({
        storageKey: "soapRequests",
        draftPrefix: DRAFT_PREFIX,
        extraDraftPrefixes: [],
        workspaceId: config.activeWorkspaceId,
        entityKind: "soapRequests" as any,
        entities: requests,
    });

    const reloadConfig = useCallback(async () => {
        const fresh = await window.api.getConfig();
        await onConfigChange(fresh);
    }, [onConfigChange]);

    const handleNewSave = useCallback(async (tabId: string, data: Omit<SavedSoapRequest, "id" | "createdAt" | "workspaceId">) => {
        const created = await window.api.addSoapRequest(data);
        await reloadConfig();
        replaceTab(tabId, created.id);
    }, [reloadConfig, replaceTab]);

    const handleTabSave = useCallback(async (tabId: string, data: Omit<SavedSoapRequest, "id" | "createdAt" | "workspaceId">) => {
        const req = loadedEntities[tabId] ?? requests.find((r) => r.id === tabId);
        if (!req) return;
        const updated = { ...req, ...data };
        setLoadedEntities((prev) => ({ ...prev, [tabId]: updated }));
        await window.api.updateSoapRequest(updated);
        await reloadConfig();
    }, [loadedEntities, requests, reloadConfig]);

    const handleDelete = useCallback(async (id: string) => {
        await window.api.deleteSoapRequest(id);
        await reloadConfig();
        closeTab(id);
    }, [reloadConfig, closeTab]);

    const handleDuplicate = useCallback(async (id: string) => {
        let r = loadedEntities[id];
        if (!r) {
            const res = await window.api.loadEntity(config.activeWorkspaceId, "soapRequests", id);
            if (res.ok && res.entity) r = res.entity as SavedSoapRequest;
        }
        if (!r) return;
        const { id: _id, createdAt: _ca, workspaceId: _ws, ...rest } = r;
        await window.api.addSoapRequest({ ...rest, name: r.name ? strings.soap.copySuffix.replace("{name}", r.name) : "" });
        await reloadConfig();
    }, [loadedEntities, config.activeWorkspaceId, reloadConfig]);

    const handleMoveItems = useCallback(async (ids: string[], folderId: string | null) => {
        for (const id of ids) {
            let r = loadedEntities[id];
            if (!r) {
                const res = await window.api.loadEntity(config.activeWorkspaceId, "soapRequests", id);
                if (res.ok && res.entity) r = res.entity as SavedSoapRequest;
            }
            if (r) await window.api.updateSoapRequest({ ...r, folderId: folderId ?? undefined });
        }
        await reloadConfig();
    }, [loadedEntities, config.activeWorkspaceId, reloadConfig]);

    const handleFoldersChange = useCallback(async () => {
        await reloadConfig();
    }, [reloadConfig]);

    const draftTabIds = openTabs.filter(isDraft);

    interface DraftSnapshot { name?: string; endpointUrl?: string; }

    const tabLabel = (tabId: string) => {
        if (isDraft(tabId)) {
            const d = loadDraft<DraftSnapshot>(tabId);
            if (d?.endpointUrl) {
                try { const u = new URL(d.endpointUrl); return u.pathname || u.host; } catch { return d.endpointUrl.slice(0, 20); }
            }
            return strings.soap.newRequestTab;
        }
        const r = requests.find((x) => x.id === tabId);
        if (!r) return "…";
        if (r.name) return r.name;
        if (r.endpointUrl) {
            try { const u = new URL(r.endpointUrl); return u.pathname || u.host; } catch { return r.endpointUrl.slice(0, 20); }
        }
        return strings.soap.requestLabel;
    };

    const folderViewItems: FolderTreeItem[] = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (q
            ? requests.filter((r) => r.name.toLowerCase().includes(q) || r.endpointUrl.toLowerCase().includes(q))
            : requests
        ).map((r): FolderTreeItem => ({
            id: r.id,
            name: r.name || r.endpointUrl?.slice(0, 40) || strings.soap.requestLabel,
            folderId: r.folderId ?? null,
            isActive: activeTab === r.id,
            isEnabled: true,
        }));
    }, [requests, search, activeTab]);

    // -- Sidebar ------------------------------------------------------------

    const sidebarContent = (
        <>
            <SidebarHeader onCollapse={() => setSidebarOpen(false)} collapseTitle={strings.soap.collapseSidebar}>
                <SearchInput value={search} onChange={setSearch} placeholder={strings.soap.searchRequests} />
            </SidebarHeader>
            <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0" style={{ display: "flex", flexDirection: "column" }}>
                {draftTabIds.length > 0 && (
                    <DraftsFolder
                        label={strings.soap.drafts}
                        draftTabIds={draftTabIds}
                        activeTab={activeTab}
                        onOpenTab={(id) => setActiveTab(id)}
                        onCloseTab={closeTab}
                        tabLabel={tabLabel}
                    />
                )}
                <FolderTree
                    kind="soapRequest"
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

    // -- Main content -------------------------------------------------------

    const mainContent = (
        <div className="flex flex-col flex-1 overflow-hidden min-w-0 h-full">
            <TabBar
                tabs={openTabs.map((id) => ({ id, label: tabLabel(id), isDraft: isDraft(id) }))}
                activeTab={activeTab}
                onTabClick={setActiveTab}
                onTabClose={closeTab}
                onNewTab={openNewTab}
                newTabTitle={strings.soap.newRequestTabTitle}
                closeTabTitle={strings.soap.closeTab}
                onCloseOthers={closeOtherTabs}
                onCloseAll={closeAllTabs}
                onTabDuplicate={handleDuplicate}
            />

            <div className="flex-1 overflow-hidden relative">
                {openTabs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                        <div className="opacity-10 mb-1"><FileCode size={48} /></div>
                        <div className="text-sm font-medium text-text-base">{strings.soap.noRequestsOpen}</div>
                        <p className="text-xs text-text-dim max-w-xs leading-relaxed">
                            {strings.soap.noRequestsOpenHint}
                        </p>
                    </div>
                ) : (
                    openTabs.map((tabId) => {
                        const isUnsaved = isDraft(tabId);
                        const req = isUnsaved ? null : (loadedEntities[tabId] ?? requests.find((r) => r.id === tabId) ?? null);
                        if (!isUnsaved && !req) return null;
                        return (
                            <div key={tabId} className="absolute inset-0 flex flex-col overflow-hidden" style={{ display: activeTab === tabId ? "flex" : "none" }}>
                                <SoapTab
                                    ref={(el) => { (tabRefs as any).current[tabId] = el; }}
                                    tabType="request"
                                    tabId={tabId}
                                    draftTabId={isUnsaved ? tabId : null}
                                    initial={isUnsaved ? null : req}
                                    folders={folders}
                                    activeEnv={activeEnv}
                                    onSave={(data) => isUnsaved
                                        ? handleNewSave(tabId, data as Omit<SavedSoapRequest, "id" | "createdAt" | "workspaceId">)
                                        : handleTabSave(tabId, data as Omit<SavedSoapRequest, "id" | "createdAt" | "workspaceId">)
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
                collapseTitle={strings.soap.collapseSidebar}
                expandTitle={strings.soap.expandSidebar}
                storageKey="soap-requests-panel-sidebar"
                collapsedBadge={requests.length > 0 ? (
                    <span className="text-[9px] text-text-dim font-mono" title={strings.soap.requestCount.replace("{count}", String(requests.length))}
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1.4 }}>{requests.length}</span>
                ) : undefined}
            >
                {mainContent}
            </SidebarLayout>
        </>
    );
}
