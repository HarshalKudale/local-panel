import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppConfig, MockRule, Environment } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import RestTab from "@/components/rest/RestTab";
import FolderTree, { FolderTreeItem } from "@/components/sidebar/FolderTree";
import DraftsFolder from "@/components/sidebar/DraftsFolder";
import { loadDraft } from "@/lib/useDraftPersist";
import { useEntityTabs } from "@/lib/useEntityTabs";
import { strings } from "@/lib/strings";
import { entityRelPath, calculateFolderStatus } from "@/lib/utils";
import { findBlocksFolder, ensureBlocksFolderId, buildBlockMock } from "@/lib/blocks";
import { Zap } from "@/lib/icons";
import TabBar from "@/components/editor/TabBar";
import { SidebarLayout, SidebarHeader } from "@/components/ui";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";


// -- Draft tab prefix -------------------------------------------------------

const DRAFT_PREFIX = "mock-draft-";
const isDraft = (id: string) => id.startsWith(DRAFT_PREFIX) || id.startsWith("prefill-");

// -- Props ------------------------------------------------------------------

interface Props {
  config: AppConfig;
  onConfigChange: (cfg: AppConfig) => Promise<void>;
  pendingMockInitial?: Partial<MockRule> | null;
  onPendingConsumed?: () => void;
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

// -- MocksPanel -------------------------------------------------------------

export default function MocksPanel({
  config, onConfigChange, pendingMockInitial, onPendingConsumed,
  activeEnv = null, onHistoryOpen, onEntityPathChange, historyOpen = false,
  onAfterSave, entitySyncStatus, onPublishItem, onPublishFolder, onRestoreItem,
}: Props) {
  const mocks = config.mocks ?? [];
  const folders = config.mockFolders ?? [];

  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    openTabs, activeTab, setActiveTab,
    loadedEntities, setLoadedEntities,
    tabRefs, isDraft,
    openTab, openNewTab, closeTab, replaceTab, closeOtherTabs, closeAllTabs,
  } = useEntityTabs<MockRule>({
    storageKey: "mocks",
    draftPrefix: DRAFT_PREFIX,
    extraDraftPrefixes: ["prefill-"],
    workspaceId: config.activeWorkspaceId,
    entityKind: "mocks",
    entities: mocks,
  });

  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const [prefillData, setPrefillData] = useState<Record<string, Partial<MockRule>>>({})

  useEffect(() => {
    if (!pendingMockInitial) return;
    const tabId = `prefill-${Date.now()}`;
    setPrefillData((prev) => ({ ...prev, [tabId]: pendingMockInitial }));
    openTab(tabId);
    onPendingConsumed?.();
  }, [pendingMockInitial]);

  const getEntityFilePath = useCallback((tabId: string): string => {
    if (isDraft(tabId)) return "";
    const m = mocks.find((x) => x.id === tabId);
    if (!m) return "";
    return entityRelPath("mocks", m, folders);
  }, [mocks, folders]);

  useEffect(() => {
    if (!historyOpen || !activeTab) return;
    const path = getEntityFilePath(activeTab);
    if (path) onEntityPathChange?.(path);
  }, [activeTab, historyOpen, getEntityFilePath, onEntityPathChange]);

  const reloadMocks = useCallback(async () => {
    const fresh = await window.api.getConfig();
    await onConfigChange(fresh);
  }, [onConfigChange]);

  const handleToggle = useCallback(async (mock: MockRule) => {
    await window.api.setEntityEnabled(config.activeWorkspaceId, "mocks", mock.id, !mock.enabled);
    await reloadMocks();
  }, [mocks, config.activeWorkspaceId, reloadMocks]);

  const handleToggleFolderItems = useCallback(async (folderId: string | null, enable: boolean) => {
    const inFolder = mocks.filter((m) => (m.folderId ?? null) === folderId);
    for (const m of inFolder) {
      if (m.enabled !== enable) await window.api.setEntityEnabled(config.activeWorkspaceId, "mocks", m.id, enable);
    }
    await reloadMocks();
  }, [mocks, config.activeWorkspaceId, reloadMocks]);

  const handleNewMockSave = useCallback(async (tabId: string, data: Omit<MockRule, "id" | "createdAt" | "workspaceId">) => {
    const created = await window.api.addMock(data);
    await reloadMocks();
    replaceTab(tabId, created.id);
    setPrefillData((prev) => { const next = { ...prev }; delete next[tabId]; return next; });
    onAfterSave?.();
  }, [mocks.length, reloadMocks, replaceTab, onAfterSave]);

  const handleTabSave = useCallback(async (tabId: string, data: Omit<MockRule, "id" | "createdAt" | "workspaceId">) => {
    const mock = loadedEntities[tabId] ?? mocks.find((m) => m.id === tabId);
    if (!mock) return;
    const updated = { ...mock, ...data };
    setLoadedEntities((prev) => ({ ...prev, [tabId]: updated }));
    await window.api.updateMock(updated);
    await reloadMocks();
    onAfterSave?.();
  }, [loadedEntities, mocks, reloadMocks, onAfterSave]);

  const handleDelete = useCallback(async (id: string) => {
    const ok = await confirm("Delete this mock? This cannot be undone.");
    if (!ok) return;
    closeTab(id);
    await window.api.deleteMock(id);
    await reloadMocks();
  }, [confirm, reloadMocks, closeTab]);

  // Close all open tabs for a folder's mocks before the folder is deleted
  const handleBeforeDeleteFolder = useCallback((folderId: string) => {
    mocks
      .filter((m) => m.folderId === folderId)
      .forEach((m) => closeTab(m.id));
  }, [mocks, closeTab]);

  const handleDuplicate = useCallback(async (id: string) => {
    let m = loadedEntities[id];
    if (!m) {
      const res = await window.api.loadEntity(config.activeWorkspaceId, "mocks", id);
      if (res.ok && res.entity) m = res.entity as MockRule;
    }
    if (!m) return;
    const { id: _id, createdAt: _ca, workspaceId: _ws, ...rest } = m;
    await window.api.addMock({ ...rest, name: m.name ? `${m.name} (copy)` : "" });
    await reloadMocks();
  }, [loadedEntities, config.activeWorkspaceId, reloadMocks]);

  const handleMoveItems = useCallback(async (ids: string[], folderId: string | null) => {
    for (const id of ids) {
      let m = loadedEntities[id] ?? mocks.find((x) => x.id === id);
      if (!m) {
        const res = await window.api.loadEntity(config.activeWorkspaceId, "mocks", id);
        if (res.ok && res.entity) m = res.entity as MockRule;
      }
      if (m) await window.api.updateMock({ ...m, folderId: folderId ?? undefined });
    }
    await reloadMocks();
  }, [loadedEntities, mocks, config.activeWorkspaceId, reloadMocks]);

  const handleFoldersChange = useCallback(async () => {
    const fresh = await window.api.getConfig();
    await onConfigChange(fresh);
  }, [onConfigChange]);

  const blocksFolder = useMemo(() => findBlocksFolder(folders), [folders]);

  // Block = move a mock into the application-managed Blocks folder as a 403 block-mock.
  const handleBlockItem = useCallback(async (id: string) => {
    const m = mocks.find((x) => x.id === id);
    if (!m) return;
    const folderId = await ensureBlocksFolderId(folders);
    await window.api.deleteMock(id);
    closeTab(id);
    await window.api.addMock(buildBlockMock(m.method, m.urlPattern, folderId));
    await reloadMocks();
  }, [mocks, folders, closeTab, reloadMocks]);

  // Unblock = delete the block mock entirely.
  const handleUnblockItem = useCallback(async (id: string) => {
    closeTab(id);
    await window.api.deleteMock(id);
    await reloadMocks();
  }, [closeTab, reloadMocks]);


  const filteredMocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mocks;
    return mocks.filter((m) => m.name.toLowerCase().includes(q) || m.urlPattern.toLowerCase().includes(q) || m.method.toLowerCase().includes(q));
  }, [mocks, search]);


  interface MockDraftSnapshot { name?: string; method?: string; urlPattern?: string; }

  const tabLabel = (tabId: string) => {
    if (isDraft(tabId)) {
      if (tabId.startsWith("prefill-")) {
        const pf = prefillData[tabId];
        if (!pf) return strings.mocks.newMock;
        if (pf.name) return pf.name;
        if (pf.method && pf.urlPattern) {
          try { const u = new URL(pf.urlPattern); const last = u.pathname.split("/").filter(Boolean).pop() ?? u.host; return `${pf.method} /${last}`; }
          catch { return `${pf.method} ${(pf.urlPattern ?? "").slice(0, 18)}`; }
        }
        return strings.mocks.newMock;
      }
      const draft = loadDraft<MockDraftSnapshot>(tabId);
      if (draft?.name) return draft.name;
      if (draft?.method && draft?.urlPattern) {
        try { const u = new URL(draft.urlPattern); const last = u.pathname.split("/").filter(Boolean).pop() ?? u.host; return `${draft.method} /${last}`; }
        catch { return `${draft.method} ${draft.urlPattern.slice(0, 18)}`; }
      }
      return strings.mocks.newMock;
    }
    const m = mocks.find((x) => x.id === tabId);
    if (!m) return "…";
    if (m.name) return m.name;
    try { const u = new URL(m.urlPattern); const last = u.pathname.split("/").filter(Boolean).pop() ?? u.host; return `${m.method} /${last}`; }
    catch { return `${m.method} ${m.urlPattern.slice(0, 18)}`; }
  };

  const folderViewItems: FolderTreeItem[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q
      ? mocks.filter((m) => m.name.toLowerCase().includes(q) || m.urlPattern.toLowerCase().includes(q) || m.method.toLowerCase().includes(q))
      : mocks
    ).map((m): FolderTreeItem => ({
      id: m.id,
      name: m.name || `${m.method} ${m.urlPattern.slice(0, 40)}`,
      method: m.method,
      folderId: m.folderId ?? null,
      isActive: activeTab === m.id,
      isEnabled: m.enabled,
      isBlock: !!blocksFolder && m.folderId === blocksFolder.id,
      relPath: entityRelPath("mocks", m, folders),
    }));
  }, [mocks, folders, search, activeTab, blocksFolder]);

  const folderStatusMap = useMemo(() => calculateFolderStatus(mocks, folders), [mocks, folders]);

  const draftTabIds = openTabs.filter(isDraft);

  // -- Sidebar ------------------------------------------------------------

  const sidebarContent = (
    <>
      <SidebarHeader onCollapse={() => setSidebarOpen(false)} collapseTitle={strings.mocks.collapseSidebar}>
        <SearchInput value={search} onChange={setSearch} placeholder={strings.mocks.searchPlaceholder} />
      </SidebarHeader>
      <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0" style={{ display: "flex", flexDirection: "column" }}>
        {draftTabIds.length > 0 && (
          <DraftsFolder
            label={strings.mocks.drafts}
            draftTabIds={draftTabIds}
            activeTab={activeTab}
            onOpenTab={(id) => setActiveTab(id)}
            onCloseTab={closeTab}
            tabLabel={tabLabel}
          />
        )}
        <FolderTree
          kind="mock"
          folders={folders}
          items={folderViewItems}
          onOpenItem={openTab}
          onDeleteItem={handleDelete}
          onToggleItem={(id) => { const m = mocks.find((x) => x.id === id); if (m) handleToggle(m); }}
          onToggleFolderItems={handleToggleFolderItems}
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
          folderStatusMap={folderStatusMap}
          onPublishItem={onPublishItem}
          onPublishFolder={onPublishFolder}
          onRestoreItem={onRestoreItem}
          onBeforeDeleteFolder={handleBeforeDeleteFolder}
          blocksFolderId={blocksFolder?.id ?? null}
          onBlockItem={handleBlockItem}
          onUnblockItem={handleUnblockItem}
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
        newTabTitle={strings.mocks.newTab}
        closeTabTitle={strings.mocks.closeTab}
        onCloseOthers={closeOtherTabs}
        onCloseAll={closeAllTabs}
        onTabDuplicate={handleDuplicate}
      />

      <div className="flex-1 overflow-hidden relative">
        {openTabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <div className="opacity-10 mb-1"><Zap size={48} /></div>
            <div className="text-sm font-medium text-text-base">{strings.mocks.noMocksOpen}</div>
            <p className="text-xs text-text-dim max-w-xs leading-relaxed">
              {strings.mocks.noMocksOpenHint}
            </p>
          </div>
        ) : (
          openTabs.map((tabId) => {
            const isUnsaved = isDraft(tabId);
            const isPrefill = tabId.startsWith("prefill-");
            const mock = isUnsaved ? null : (loadedEntities[tabId] ?? mocks.find((m) => m.id === tabId) ?? null);
            if (!isUnsaved && !mock) return null;
            const initialForTab: Partial<MockRule> | null = isPrefill
              ? (prefillData[tabId] ?? null)
              : isUnsaved ? null : mock;
            return (
              <div key={tabId} className="absolute inset-0 flex flex-col overflow-hidden" style={{ display: activeTab === tabId ? "flex" : "none" }}>
                <RestTab
                  ref={(el) => { tabRefs.current[tabId] = el; }}
                  tabType="mock"
                  tabId={tabId}
                  draftTabId={isUnsaved ? tabId : null}
                  initial={initialForTab}
                  folders={folders}
                  activeEnv={activeEnv}
                  onSave={(data) => isUnsaved
                    ? handleNewMockSave(tabId, data as Omit<MockRule, "id" | "createdAt" | "workspaceId">)
                    : handleTabSave(tabId, data as Omit<MockRule, "id" | "createdAt" | "workspaceId">)
                  }
                  onClose={() => closeTab(tabId)}
                  showCurlImport={isUnsaved}
                  enabled={isUnsaved ? undefined : mocks.find((m) => m.id === tabId)?.enabled}
                  onToggleEnabled={isUnsaved ? undefined : () => { const m = mocks.find((x) => x.id === tabId); if (m) handleToggle(m); }}
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
        storageKey="mocks-panel-sidebar"
        collapsedBadge={mocks.length > 0 ? (
          <span className="text-[9px] text-text-dim font-mono" title={`${mocks.length} mocks`}
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1.4 }}>{mocks.length}</span>
        ) : undefined}
      >
        {mainContent}
      </SidebarLayout>
      {ConfirmDialogElement}
    </>
  );
}

