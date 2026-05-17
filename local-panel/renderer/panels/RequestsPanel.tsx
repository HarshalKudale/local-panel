import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppConfig, SavedRequest, MockRule, Folder, Environment } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import FolderTree, { FolderTreeItem } from "@/components/sidebar/FolderTree";
import RestTab from "@/components/rest/RestTab";
import CollectionRunner from "@/components/rest/CollectionRunner";
import DraftsFolder from "@/components/sidebar/DraftsFolder";
import { loadDraft } from "@/lib/useDraftPersist";
import { useEntityTabs } from "@/lib/useEntityTabs";
import { strings } from "@/lib/strings";
import { entityRelPath } from "@/lib/utils";
import { Zap } from "@/lib/icons";
import TabBar from "@/components/editor/TabBar";
import { SidebarLayout, SidebarHeader } from "@/components/ui";


// ── Draft tab prefix ───────────────────────────────────────────────────────

const DRAFT_PREFIX = "req-draft-";
const RUNNER_PREFIX = "runner-";
const isDraft = (id: string) => id.startsWith(DRAFT_PREFIX) || id.startsWith("pending-");
const isRunner = (id: string) => id.startsWith(RUNNER_PREFIX);

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  config: AppConfig;
  onConfigChange: (cfg: AppConfig) => Promise<void>;
  pendingOpenRequest?: Omit<SavedRequest, "id" | "createdAt" | "workspaceId"> | null;
  onPendingConsumed?: () => void;
  onOpenMockEditor?: (initial: Partial<MockRule>) => void;
  activeEnv?: Environment | null;
  onHistoryOpen?: (filePath: string) => void;
  onEntityPathChange?: (filePath: string) => void;
  historyOpen?: boolean;
  onAfterSave?: () => void;
  entitySyncStatus?: Record<string, "clean" | "modified" | "new" | "deleted">;
  onPublishItem?: (id: string) => void;
  onPublishFolder?: (folderId: string | null) => void;
  onRestoreItem?: (id: string) => void;
}

// ── RequestsPanel ──────────────────────────────────────────────────────────

export default function RequestsPanel({
  config, onConfigChange, pendingOpenRequest, onPendingConsumed, onOpenMockEditor,
  activeEnv = null, onHistoryOpen, onEntityPathChange, historyOpen = false,
  onAfterSave, entitySyncStatus, onPublishItem, onPublishFolder, onRestoreItem,
}: Props) {
  const requests = config.requests ?? [];
  const folders = config.requestFolders ?? [];


  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    openTabs, activeTab, setActiveTab,
    loadedEntities, setLoadedEntities,
    tabRefs, isDraft,
    openTab, openNewTab, closeTab, replaceTab,
  } = useEntityTabs<SavedRequest>({
    storageKey: "requests",
    draftPrefix: DRAFT_PREFIX,
    extraDraftPrefixes: ["pending-", RUNNER_PREFIX],
    workspaceId: config.activeWorkspaceId,
    entityKind: "requests",
    entities: requests,
  });

  const [pendingData, setPendingData] = useState<Record<string, Omit<SavedRequest, "id" | "createdAt" | "workspaceId">>>({});

  // Open a pending request in a new draft tab
  useEffect(() => {
    if (!pendingOpenRequest) return;
    const tabId = `pending-${Date.now()}`;
    setPendingData((prev) => ({ ...prev, [tabId]: pendingOpenRequest }));
    openTab(tabId);
    onPendingConsumed?.();
  }, [pendingOpenRequest]);

  const reloadRequests = useCallback(async () => {
    const fresh = await window.api.getConfig();
    await onConfigChange(fresh);
  }, [onConfigChange]);

  const getEntityFilePath = useCallback((tabId: string): string => {
    if (isDraft(tabId)) return "";
    const r = requests.find((x) => x.id === tabId);
    if (!r) return "";
    return entityRelPath("requests", r, folders);
  }, [requests, folders]);

  useEffect(() => {
    if (!historyOpen || !activeTab) return;
    const path = getEntityFilePath(activeTab);
    if (path) onEntityPathChange?.(path);
  }, [activeTab, historyOpen, getEntityFilePath, onEntityPathChange]);

  const handleFoldersChange = useCallback(async () => {
    const fresh = await window.api.getConfig();
    await onConfigChange(fresh);
  }, [onConfigChange]);

  const handleNewSave = useCallback(async (tabId: string, data: Omit<SavedRequest, "id" | "createdAt" | "workspaceId">) => {
    const created = await window.api.addRequest(data);
    await reloadRequests();
    replaceTab(tabId, created.id);
    setPendingData((prev) => { const next = { ...prev }; delete next[tabId]; return next; });
    onAfterSave?.();
  }, [reloadRequests, replaceTab, onAfterSave]);

  const handleTabSave = useCallback(async (tabId: string, data: Omit<SavedRequest, "id" | "createdAt" | "workspaceId">) => {
    const req = loadedEntities[tabId] ?? requests.find((r) => r.id === tabId);
    if (!req) return;
    const updated = { ...req, ...data };
    setLoadedEntities((prev) => ({ ...prev, [tabId]: updated }));
    await window.api.updateRequest(updated);
    await reloadRequests();
    onAfterSave?.();
  }, [loadedEntities, requests, reloadRequests, onAfterSave]);

  const handleDelete = useCallback(async (id: string) => {
    await window.api.deleteRequest(id);
    await reloadRequests();
    closeTab(id);
  }, [reloadRequests, closeTab]);

  const handleDuplicate = useCallback(async (id: string) => {
    let r = loadedEntities[id];
    if (!r) {
      const res = await window.api.loadEntity(config.activeWorkspaceId, "requests", id);
      if (res.ok && res.entity) r = res.entity as SavedRequest;
    }
    if (!r) return;
    const { id: _id, createdAt: _ca, workspaceId: _ws, ...rest } = r;
    await window.api.addRequest({ ...rest, name: r.name ? `${r.name} (copy)` : "" });
    await reloadRequests();
  }, [loadedEntities, config.activeWorkspaceId, reloadRequests]);

  const handleMoveItems = useCallback(async (ids: string[], folderId: string | null) => {
    for (const id of ids) {
      let r = loadedEntities[id];
      if (!r) {
        const res = await window.api.loadEntity(config.activeWorkspaceId, "requests", id);
        if (res.ok && res.entity) r = res.entity as SavedRequest;
      }
      if (r) await window.api.updateRequest({ ...r, folderId: folderId ?? undefined });
    }
    await reloadRequests();
  }, [loadedEntities, config.activeWorkspaceId, reloadRequests]);

  const handleOpenRunner = useCallback((folderId: string) => {
    const tabId = `${RUNNER_PREFIX}${folderId}`;
    openTab(tabId);
  }, [openTab]);

  const handleSaveRunnerReport = useCallback(async (report: any) => {
    await window.api.saveRunnerReport(config.activeWorkspaceId, report);
  }, [config.activeWorkspaceId]);


  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q) || r.method.toLowerCase().includes(q));
  }, [requests, search]);


  const draftTabIds = openTabs.filter(isDraft);

  interface RequestDraftSnapshot { name?: string; method?: string; url?: string; }

  const tabLabel = (tabId: string) => {
    if (isRunner(tabId)) {
      const fId = tabId.slice(RUNNER_PREFIX.length);
      const folder = folders.find((f) => f.id === fId);
      return `Runner: ${folder?.name ?? "Collection"}`;
    }
    if (isDraft(tabId)) {
      const draft = loadDraft<RequestDraftSnapshot>(tabId);
      if (draft?.url) {
        try { const u = new URL(draft.url); const last = u.pathname.split("/").filter(Boolean).pop() ?? u.host; return `${draft.method ?? "GET"} /${last}`; } catch { return draft.method ?? "New Request"; }
      }
      const pd = pendingData[tabId];
      if (pd?.url) {
        try { const u = new URL(pd.url); const last = u.pathname.split("/").filter(Boolean).pop() ?? u.host; return `${pd.method} /${last}`; } catch { return pd.method; }
      }
      return strings.requests.newRequest;
    }
    const r = requests.find((x) => x.id === tabId);
    if (!r) return "…";
    if (r.name) return r.name;
    try { const u = new URL(r.url); const last = u.pathname.split("/").filter(Boolean).pop() ?? u.host; return `${r.method} /${last}`; }
    catch { return `${r.method} ${r.url.slice(0, 18)}`; }
  };

  const folderViewItems: FolderTreeItem[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q
      ? requests.filter((r) => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q) || r.method.toLowerCase().includes(q))
      : requests
    ).map((r): FolderTreeItem => ({
      id: r.id,
      name: r.name || (() => {
        try { const u = new URL(r.url); const last = u.pathname.split("/").filter(Boolean).pop() ?? u.host; return `/${last}`; }
        catch { return r.url.slice(0, 40); }
      })(),
      method: r.method,
      folderId: r.folderId ?? null,
      isActive: activeTab === r.id,
      isEnabled: true,
      relPath: entityRelPath("requests", r, folders),
    }));
  }, [requests, folders, search, activeTab]);

  // ── Sidebar ────────────────────────────────────────────────────────────

  const sidebarContent = (
    <>
      <SidebarHeader onCollapse={() => setSidebarOpen(false)} collapseTitle={strings.mocks.collapseSidebar}>
        <SearchInput value={search} onChange={setSearch} placeholder={strings.requests.searchPlaceholder} />
      </SidebarHeader>
      <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0" style={{ display: "flex", flexDirection: "column" }}>
        {draftTabIds.length > 0 && (
          <DraftsFolder
            label={strings.requests.drafts}
            draftTabIds={draftTabIds}
            activeTab={activeTab}
            onOpenTab={(id) => setActiveTab(id)}
            onCloseTab={closeTab}
            tabLabel={tabLabel}
          />
        )}
        <FolderTree
          kind="request"
          folders={folders}
          items={folderViewItems}
          onOpenItem={openTab}
          onDeleteItem={handleDelete}
          onFoldersChange={handleFoldersChange}
          onDuplicateItem={handleDuplicate}
          onMoveItems={handleMoveItems}
          onOpenNewTab={openNewTab}
          onBeforeCreateFolder={() => true}
          onHistoryItem={onHistoryOpen ? (id) => {
            const path = getEntityFilePath(id);
            if (path) onHistoryOpen(path);
          } : undefined}
          pathStatusMap={entitySyncStatus}
          onPublishItem={onPublishItem}
          onPublishFolder={onPublishFolder}
          onRestoreItem={onRestoreItem}
          onOpenRunner={handleOpenRunner}
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
        newTabTitle={strings.requests.newTab}
        closeTabTitle={strings.requests.closeTab}
      />

      <div className="flex-1 overflow-hidden relative">
        {openTabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <div className="opacity-10 mb-1"><Zap size={48} /></div>
            <div className="text-sm font-medium text-text-base">{strings.requests.noRequestsOpen}</div>
            <p className="text-xs text-text-dim max-w-xs leading-relaxed">
              {strings.requests.noRequestsOpenHint.replace("+", "")}
              <span className="text-accent font-semibold">+</span>
              {" to create a new one."}
            </p>
          </div>
        ) : (
          openTabs.map((tabId) => {
            // Runner tab
            if (isRunner(tabId)) {
              const fId = tabId.slice(RUNNER_PREFIX.length);
              const folder = folders.find((f) => f.id === fId);
              const folderRequests = requests.filter((r) => r.folderId === fId);
              return (
                <div key={tabId} className="absolute inset-0 flex flex-col overflow-hidden" style={{ display: activeTab === tabId ? "flex" : "none" }}>
                  <CollectionRunner
                    folderId={fId}
                    folderName={folder?.name ?? "Collection"}
                    requests={folderRequests}
                    activeEnv={activeEnv}
                    wsId={config.activeWorkspaceId}
                    onClose={() => closeTab(tabId)}
                    onSaveReport={handleSaveRunnerReport}
                  />
                </div>
              );
            }

            const isUnsaved = isDraft(tabId);
            const req = isUnsaved ? null : (loadedEntities[tabId] ?? requests.find((r) => r.id === tabId) ?? null);
            const initialData = isUnsaved ? (pendingData[tabId] ?? null) : req;
            if (!isUnsaved && !req) return null;
            return (
              <div key={tabId} className="absolute inset-0 flex flex-col overflow-hidden" style={{ display: activeTab === tabId ? "flex" : "none" }}>
                <RestTab
                  ref={(el) => { tabRefs.current[tabId] = el; }}
                  tabType="request"
                  tabId={tabId}
                  draftTabId={isUnsaved ? tabId : null}
                  initial={initialData}
                  folders={folders}
                  activeEnv={activeEnv}
                  onSave={(data) => isUnsaved
                    ? handleNewSave(tabId, data as Omit<SavedRequest, "id" | "createdAt" | "workspaceId">)
                    : handleTabSave(tabId, data as Omit<SavedRequest, "id" | "createdAt" | "workspaceId">)
                  }
                  onCreateMock={(initial) => onOpenMockEditor?.(initial)}
                  onClose={() => closeTab(tabId)}
                  showCurlImport={isUnsaved}
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
        collapseTitle={strings.mocks.collapseSidebar}
        expandTitle={strings.mocks.expandSidebar}
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

