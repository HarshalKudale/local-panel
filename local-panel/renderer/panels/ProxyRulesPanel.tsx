import React, { useState, useMemo, useCallback } from "react";
import { AppConfig, ProxyRule } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import RuleTab, { RuleTabHandle, RuleSavePayload } from "@/components/rules/RuleTab";
import FolderTree, { FolderTreeItem } from "@/components/sidebar/FolderTree";
import DraftsFolder from "@/components/sidebar/DraftsFolder";
import { loadDraft } from "@/lib/useDraftPersist";
import { useEntityTabs } from "@/lib/useEntityTabs";
import { strings } from "@/lib/strings";
import { entityRelPath } from "@/lib/utils";
import { Settings } from "@/lib/icons";
import TabBar from "@/components/editor/TabBar";
import { SidebarLayout, SidebarHeader } from "@/components/ui";


const DRAFT_PREFIX = "rule-draft-";

interface Props {
  config: AppConfig;
  onConfigChange: (cfg: AppConfig) => Promise<void>;
  onHistoryOpen?: (filePath: string) => void;
  entitySyncStatus?: Record<string, "clean" | "modified" | "new" | "deleted">;
  onPublishItem?: (id: string) => void;
  onPublishFolder?: (folderId: string | null) => void;
  onRestoreItem?: (id: string) => void;
}

export default function ProxyRulesPanel({
  config, onConfigChange, onHistoryOpen, entitySyncStatus, onPublishItem, onPublishFolder, onRestoreItem,
}: Props) {
  const rules = config.proxyRules ?? [];
  const folders = config.ruleFolders ?? [];

  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    openTabs, activeTab, setActiveTab,
    loadedEntities, setLoadedEntities,
    tabRefs, isDraft,
    openTab, openNewTab, closeTab, replaceTab,
  } = useEntityTabs<ProxyRule>({
    storageKey: "rules",
    draftPrefix: DRAFT_PREFIX,
    workspaceId: config.activeWorkspaceId,
    entityKind: "rules",
    entities: rules,
  });

  const reloadRules = useCallback(async () => {
    const fresh = await window.api.getConfig();
    await onConfigChange(fresh);
  }, [onConfigChange]);

  const handleToggle = useCallback(async (rule: ProxyRule) => {
    if (isDraft(rule.id)) return; // drafts cannot be enabled
    await window.api.setEntityEnabled(config.activeWorkspaceId, "rules", rule.id, !rule.enabled);
    await reloadRules();
  }, [rules, isDraft, config.activeWorkspaceId, reloadRules]);

  const handleToggleFolderItems = useCallback(async (folderId: string | null, enable: boolean) => {
    const inFolder = rules.filter((r) => (r.folderId ?? null) === folderId && !isDraft(r.id));
    for (const stub of inFolder) {
      if (stub.enabled !== enable) await window.api.setEntityEnabled(config.activeWorkspaceId, "rules", stub.id, enable);
    }
    await reloadRules();
  }, [rules, isDraft, config.activeWorkspaceId, reloadRules]);

  const handleNewRuleSave = useCallback(async (tabId: string, data: RuleSavePayload) => {
    const created = await window.api.addRule({
      ...data,
      workspaceId: config.activeWorkspaceId,
      enabled: false,
    } as Omit<ProxyRule, "id" | "createdAt" | "workspaceId">);
    await reloadRules();
    replaceTab(tabId, created.id);
  }, [rules.length, config.activeWorkspaceId, reloadRules, replaceTab]);

  const handleTabSave = useCallback(async (tabId: string, data: RuleSavePayload) => {
    const stub = rules.find((r) => r.id === tabId);
    const existing = loadedEntities[tabId] ?? (stub ? await window.api.loadEntity(config.activeWorkspaceId, "rules", tabId)
      .then((r) => r.ok && r.entity ? r.entity as ProxyRule : null) : null);
    if (!existing) return;
    const updated: ProxyRule = { ...existing, ...data };
    setLoadedEntities((prev) => ({ ...prev, [tabId]: updated }));
    await window.api.updateRule(updated);
    await reloadRules();
  }, [rules, loadedEntities, config.activeWorkspaceId, setLoadedEntities, reloadRules]);

  const handleDelete = useCallback(async (id: string) => {
    await window.api.deleteRule(id);
    await reloadRules();
    closeTab(id);
  }, [reloadRules, closeTab]);

  const handleDuplicate = useCallback(async (id: string) => {
    const full = loadedEntities[id] ?? await window.api.loadEntity(config.activeWorkspaceId, "rules", id)
      .then((r) => r.ok && r.entity ? r.entity as ProxyRule : null);
    if (!full) return;
    const { id: _id, createdAt: _ca, workspaceId: _ws, ...rest } = full;
    await window.api.addRule({ ...rest, name: full.name ? `${full.name} (copy)` : "", enabled: false });
    await reloadRules();
  }, [loadedEntities, config.activeWorkspaceId, reloadRules]);

  const handleMoveItems = useCallback(async (ids: string[], folderId: string | null) => {
    for (const id of ids) {
      let full = loadedEntities[id] ?? await window.api.loadEntity(config.activeWorkspaceId, "rules", id)
        .then((r) => r.ok && r.entity ? r.entity as ProxyRule : null);
      if (!full) continue;
      await window.api.updateRule({ ...full, folderId: folderId ?? undefined });
    }
    await reloadRules();
  }, [loadedEntities, config.activeWorkspaceId, reloadRules]);

  const handleFoldersChange = useCallback(async () => {
    const fresh = await window.api.getConfig();
    await onConfigChange(fresh);
  }, [onConfigChange]);

  // ── Label helpers ──────────────────────────────────────────────────────

  interface RuleDraftSnapshot { name?: string; pattern?: string; }

  const tabLabel = (tabId: string) => {
    if (isDraft(tabId)) {
      const draft = loadDraft<RuleDraftSnapshot>(tabId);
      if (draft?.name) return draft.name;
      if (draft?.pattern) return draft.pattern.slice(0, 30);
      return strings.proxyRules.newRule;
    }
    const r = rules.find((x) => x.id === tabId);
    if (!r) return "…";
    return r.name || r.pattern.slice(0, 30) || strings.proxyRules.newRule;
  };

  // ── Folder tree items ──────────────────────────────────────────────────

  const folderViewItems: FolderTreeItem[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q
      ? rules.filter((r) => r.name.toLowerCase().includes(q) || r.pattern.toLowerCase().includes(q))
      : rules
    ).map((r): FolderTreeItem => ({
      id: r.id,
      name: r.name || r.pattern.slice(0, 40) || strings.proxyRules.newRule,
      folderId: r.folderId ?? null,
      isActive: activeTab === r.id,
      isEnabled: r.enabled,
      relPath: entityRelPath("rules", r, folders),
    }));
  }, [rules, folders, search, activeTab]);

  const draftTabIds = openTabs.filter(isDraft);

  // ── Sidebar ────────────────────────────────────────────────────────────

  const sidebarContent = (
    <>
      <SidebarHeader onCollapse={() => setSidebarOpen(false)} collapseTitle={strings.proxyRules.collapseSidebar}>
        <SearchInput value={search} onChange={setSearch} placeholder={strings.proxyRules.searchPlaceholder} />
      </SidebarHeader>
      <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0" style={{ display: "flex", flexDirection: "column" }}>
        {draftTabIds.length > 0 && (
          <DraftsFolder
            label={strings.proxyRules.drafts}
            draftTabIds={draftTabIds}
            activeTab={activeTab}
            onOpenTab={(id) => setActiveTab(id)}
            onCloseTab={closeTab}
            tabLabel={tabLabel}
          />
        )}
        <FolderTree
          kind="rule"
          folders={folders}
          items={folderViewItems}
          onOpenItem={openTab}
          onDeleteItem={handleDelete}
          onToggleItem={(id) => { const r = rules.find((x) => x.id === id); if (r) handleToggle(r); }}
          onToggleFolderItems={handleToggleFolderItems}
          onFoldersChange={handleFoldersChange}
          onDuplicateItem={handleDuplicate}
          onMoveItems={handleMoveItems}
          onOpenNewTab={openNewTab}
          onBeforeCreateFolder={() => true}
          onHistoryItem={onHistoryOpen ? (id) => {
            const r = rules.find((x) => x.id === id);
            if (r) onHistoryOpen(entityRelPath("rules", r, folders));
          } : undefined}
          pathStatusMap={entitySyncStatus}
          onPublishItem={onPublishItem}
          onPublishFolder={onPublishFolder}
          onRestoreItem={onRestoreItem}
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
        newTabTitle={strings.proxyRules.newTab}
        closeTabTitle={strings.proxyRules.closeTab}
      />
      <div className="flex-1 overflow-hidden relative">
        {openTabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <div className="opacity-10 mb-1"><Settings size={48} /></div>
            <div className="text-sm font-medium text-text-base">{strings.proxyRules.noRulesOpen}</div>
            <p className="text-xs text-text-dim max-w-xs leading-relaxed">
              Click a rule in the tree, or press <span className="text-accent font-semibold">+</span> to create a new one.
            </p>
          </div>
        ) : (
          openTabs.map((tabId) => {
            const isUnsaved = isDraft(tabId);
            const rule = isUnsaved ? null : (loadedEntities[tabId] ?? rules.find((r) => r.id === tabId) ?? null);
            if (!isUnsaved && !rule) return null;
            return (
              <div key={tabId} className="absolute inset-0 flex flex-col overflow-hidden" style={{ display: activeTab === tabId ? "flex" : "none" }}>
                <RuleTab
                  ref={(el: RuleTabHandle | null) => { (tabRefs as React.MutableRefObject<Record<string, RuleTabHandle | null>>).current[tabId] = el; }}
                  tabId={tabId}
                  draftTabId={isUnsaved ? tabId : null}
                  initial={rule}
                  folders={folders}
                  config={config}
                  onSave={(data) => isUnsaved
                    ? handleNewRuleSave(tabId, data)
                    : handleTabSave(tabId, data)
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
        collapseTitle={strings.proxyRules.collapseSidebar}
        expandTitle={strings.proxyRules.expandSidebar}
        collapsedBadge={rules.length > 0 ? (
          <span className="text-[9px] text-text-dim font-mono" title={`${rules.length} rules`}
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1.4 }}>{rules.length}</span>
        ) : undefined}
      >
        {mainContent}
      </SidebarLayout>
    </>
  );
}
