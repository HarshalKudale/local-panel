import { useEffect, useRef } from "react";

const PREFIX = "lp:draft:";

// Tab IDs explicitly discarded by closeTab — unmount must not re-save them.
const discarded = new Set<string>();

export function saveDraft(tabId: string, data: unknown): void {
  if (discarded.has(tabId)) return;
  try { localStorage.setItem(PREFIX + tabId, JSON.stringify(data)); } catch { /* quota */ }
}

export function loadDraft<T>(tabId: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + tabId);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export function clearDraft(tabId: string): void {
  discarded.add(tabId);
  try { localStorage.removeItem(PREFIX + tabId); } catch { /* ignore */ }
}

/** Return all draft tab IDs currently stored (for a given id prefix). */
export function getDraftIds(idPrefix: string): string[] {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX + idPrefix)) {
      ids.push(k.slice(PREFIX.length));
    }
  }
  return ids;
}

/**
 * Call inside an editor to auto-save `getData()` to localStorage.
 * Pass `tabId=null` for saved (non-draft) tabs — hook becomes a no-op.
 * Pass `isEmpty` to suppress saving while all fields are blank.
 * Call `markSaved()` when the user officially saves; the draft is then
 * cleared on unmount instead of being flushed.
 */
export function useDraftPersist(
  tabId: string | null,
  getData: () => unknown,
  isEmpty?: () => boolean,
): { markSaved: () => void } {
  const savedRef   = useRef(false);
  const dataRef    = useRef(getData);
  const isEmptyRef = useRef(isEmpty);
  dataRef.current    = getData;
  isEmptyRef.current = isEmpty;

  const markSaved = () => { savedRef.current = true; };

  const shouldSkip = () => !!(isEmptyRef.current && isEmptyRef.current());

  // Debounced auto-save on every render (data changes trigger re-render)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!tabId) return;
    if (savedRef.current) return;
    if (discarded.has(tabId)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!savedRef.current && !discarded.has(tabId) && !shouldSkip()) {
        saveDraft(tabId, dataRef.current());
      }
    }, 400);
  });

  // On unmount: flush immediately if not yet saved; clear if saved
  useEffect(() => {
    return () => {
      if (!tabId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedRef.current) {
        clearDraft(tabId);
      } else if (!discarded.has(tabId) && !shouldSkip()) {
        saveDraft(tabId, dataRef.current());
      }
      // Clean up the discard entry once the component is gone
      discarded.delete(tabId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  return { markSaved };
}
