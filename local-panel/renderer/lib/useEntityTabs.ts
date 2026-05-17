import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { clearDraft, getDraftIds, loadDraft } from "@/lib/useDraftPersist";
import type { RestTabHandle } from "@/components/rest/RestTab";
import type { SavedRequest, MockRule } from "@/types";

interface Options<T> {
  storageKey: string;
  draftPrefix: string;
  extraDraftPrefixes?: string[];
  workspaceId: string;
  entityKind: "mocks" | "requests" | "rules";
  entities: T[];
}

interface EntityTabsResult<T> {
  openTabs: string[];
  activeTab: string | null;
  setActiveTab: React.Dispatch<React.SetStateAction<string | null>>;
  loadedEntities: Record<string, T>;
  setLoadedEntities: React.Dispatch<React.SetStateAction<Record<string, T>>>;
  tabRefs: React.MutableRefObject<Record<string, RestTabHandle | null>>;
  isDraft: (id: string) => boolean;
  openTab: (id: string) => void;
  openNewTab: () => void;
  closeTab: (tabId: string) => void;
  /** Replace a draft tab id with the newly saved entity id. */
  replaceTab: (draftId: string, savedId: string) => void;
}

export function useEntityTabs<T extends { id: string }>({
  storageKey,
  draftPrefix,
  extraDraftPrefixes = [],
  workspaceId,
  entityKind,
  entities,
}: Options<T>): EntityTabsResult<T> {
  const isDraft = useCallback(
    (id: string) => id.startsWith(draftPrefix) || extraDraftPrefixes.some((p) => id.startsWith(p)),
    [draftPrefix, extraDraftPrefixes],
  );

  const [openTabs, setOpenTabs] = usePersistedState<string[]>(
    `${storageKey}:openTabs`, [],
    (tabs) => tabs.filter((id) => {
      if (isDraft(id)) return getDraftIds(draftPrefix).includes(id) || extraDraftPrefixes.some((p) => id.startsWith(p));
      return entities.some((e) => e.id === id);
    }),
  );

  const [activeTab, setActiveTab] = usePersistedState<string | null>(
    `${storageKey}:activeTab`, null,
    (id) => {
      if (id === null) return null;
      if (isDraft(id)) return getDraftIds(draftPrefix).includes(id) || extraDraftPrefixes.some((p) => id.startsWith(p)) ? id : null;
      return entities.some((e) => e.id === id) ? id : null;
    },
  );

  const [loadedEntities, setLoadedEntities] = useState<Record<string, T>>({});
  const tabRefs = useRef<Record<string, RestTabHandle | null>>({});

  useEffect(() => {
    if (!activeTab || isDraft(activeTab)) return;
    if (loadedEntities[activeTab]) return;
    window.api.loadEntity(workspaceId, entityKind, activeTab).then((res) => {
      if (res.ok && res.entity) {
        const entity = res.entity as T;
        setLoadedEntities((prev) => ({ ...prev, [activeTab]: entity }));
        tabRefs.current[activeTab]?.refresh(entity as unknown as MockRule | SavedRequest);
      }
    }).catch(() => {});
  }, [activeTab, workspaceId]);

  const openTab = useCallback((id: string) => {
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveTab(id);
  }, []);

  const openNewTab = useCallback(() => {
    const existingEmpty = openTabs.find((id) => isDraft(id) && !id.startsWith(extraDraftPrefixes[0] ?? "__none__") && !loadDraft(id));
    if (existingEmpty) { setActiveTab(existingEmpty); return; }
    const tabId = `${draftPrefix}${Date.now()}`;
    setOpenTabs((p) => [...p, tabId]);
    setActiveTab(tabId);
  }, [openTabs, draftPrefix]);

  const closeTab = useCallback((tabId: string) => {
    if (isDraft(tabId)) clearDraft(tabId);
    delete tabRefs.current[tabId];
    setOpenTabs((prev) => {
      const next = prev.filter((id) => id !== tabId);
      setActiveTab((cur) => {
        if (cur !== tabId) return cur;
        return next.length > 0 ? next[next.length - 1] : null;
      });
      return next;
    });
  }, []);

  const replaceTab = useCallback((draftId: string, savedId: string) => {
    if (isDraft(draftId)) clearDraft(draftId);
    delete tabRefs.current[draftId];
    setOpenTabs((prev) => [...prev.filter((id) => id !== draftId), savedId]);
    setActiveTab(savedId);
  }, []);

  return {
    openTabs,
    activeTab,
    setActiveTab,
    loadedEntities,
    setLoadedEntities,
    tabRefs,
    isDraft,
    openTab,
    openNewTab,
    closeTab,
    replaceTab,
  };
}
