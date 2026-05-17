import React, { useState, useEffect, useRef, useCallback } from "react";
import { Folder as FolderType } from "@/types";
import { ChevronDown, Folder, FolderOpen } from "@/lib/icons";
import { methodColor, methodBg } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface FolderTreeItem {
  id: string;
  name: string;
  method?: string;
  folderId?: string | null;
  isActive?: boolean;
  isEnabled?: boolean;
  /** Relative git path e.g. "mocks/FolderName/id.json" — used for path-keyed status lookup */
  relPath?: string;
}

interface FolderNode {
  folder: FolderType | null;
  children: FolderNode[];
  items: FolderTreeItem[];
}

// ── Context menu ───────────────────────────────────────────────────────────

interface CtxMenuItem {
  label: string;
  danger?: boolean;
  sep?: boolean;
  action(): void;
}

function CtxMenu({ x, y, items, onClose }: { x: number; y: number; items: CtxMenuItem[]; onClose(): void }) {
  const menuW = 210;
  const totalH = items.reduce((s, i) => s + (i.sep ? 9 : 30), 0) + 8;
  const ax = Math.min(x, window.innerWidth - menuW - 8);
  const ay = Math.min(y, window.innerHeight - totalH - 8);

  return (
    <div
      className="fixed z-50 bg-bg2 border border-border rounded-md shadow-2xl py-1 select-none animate-scale-in"
      style={{ left: ax, top: ay, minWidth: menuW }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.sep ? (
          <div key={i} className="mx-2 my-1 border-t border-border/60" />
        ) : (
          <button
            key={i}
            onClick={item.action}
            className={`w-full text-left px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-bg3 transition-colors ${item.danger ? "text-red" : "text-text-base"}`}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ── Inline rename input ────────────────────────────────────────────────────

function InlineInput({ value, onCommit, onCancel }: { value: string; onCommit(v: string): void; onCancel(): void }) {
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      className="flex-1 bg-bg3 border border-accent rounded px-1.5 py-0.5 text-xs text-text-bright outline-none min-w-0"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); if (val.trim()) onCommit(val.trim()); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      onBlur={() => { if (val.trim()) onCommit(val.trim()); else onCancel(); }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ── Move to folder dialog ──────────────────────────────────────────────────

function MoveDialog({ folders, onMove, onCancel }: {
  folders: FolderType[];
  onMove(folderId: string | null): void;
  onCancel(): void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="bg-bg2 border border-border rounded-lg shadow-2xl w-56"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-text-dim border-b border-border">
          Move to Folder
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg3 text-text-dim cursor-pointer"
            onClick={() => onMove(null)}
          >
            / root
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg3 text-text-base cursor-pointer"
              onClick={() => onMove(f.id)}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="border-t border-border px-3 py-2">
          <button
            className="w-full text-center text-xs text-text-dim hover:text-text-base cursor-pointer py-0.5"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="bg-bg2 border border-border rounded-lg shadow-2xl p-4 w-72"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs text-text-base leading-relaxed mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded border border-border hover:bg-bg3 text-text-dim cursor-pointer"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded font-semibold text-white cursor-pointer"
            style={{ background: "var(--c-red)" }}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

const INDENT = 14;
const LINE_COLOR = "var(--c-border)";
const CONNECTOR_W = 12;

// ── FolderTree ─────────────────────────────────────────────────────────────

export type EntitySyncStatus = "clean" | "modified" | "new" | "deleted";

interface Props {
  kind: "mock" | "request" | "ws" | "webhook" | "rule" | "graphqlRequest" | "graphqlMock" | "soapRequest" | "soapMock" | "grpcRequest" | "grpcMock";
  folders: FolderType[];
  items: FolderTreeItem[];
  onOpenItem(id: string): void;
  onDeleteItem(id: string): void;
  onToggleItem?: (id: string) => void;
  /** Enable or disable all items in a folder (null = root). Uniqueness enforcement is caller's responsibility. */
  onToggleFolderItems?: (folderId: string | null, enable: boolean) => void;
  onFoldersChange(): void;
  onDuplicateItem?: (id: string) => void;
  onMoveItems?: (ids: string[], folderId: string | null) => void;
  onOpenNewTab?: () => void;
  /** Called when the history icon is clicked for an item. Receives the entity id. */
  onHistoryItem?: (id: string) => void;
  /** Map of relative git path → sync status for color-coded indicators (preferred) */
  pathStatusMap?: Record<string, EntitySyncStatus>;
  /** @deprecated use pathStatusMap (entity-ID-keyed fallback, kept for flat entities like mappings) */
  entitySyncStatus?: Record<string, EntitySyncStatus>;
  /** Called when user publishes a single entity via context menu */
  onPublishItem?: (id: string) => void;
  /** Called when user publishes all items in a folder (null = root) */
  onPublishFolder?: (folderId: string | null) => void;
  /** Called when user restores an entity to its last committed state */
  onRestoreItem?: (id: string) => void;
  /**
   * Optional gate callback invoked before a new folder is created.
   * Return false to cancel folder creation (e.g. to show an upgrade modal).
   */
  onBeforeCreateFolder?: () => boolean;
}

export default function FolderTree({
  kind, folders, items, onOpenItem, onDeleteItem, onToggleItem, onToggleFolderItems, onFoldersChange,
  onDuplicateItem, onMoveItems, onOpenNewTab, onHistoryItem,
  pathStatusMap, entitySyncStatus, onPublishItem, onPublishFolder, onRestoreItem,
  onBeforeCreateFolder,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["__root__"]));
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [showMove, setShowMove] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ itemIds: string[]; folderIds: string[] } | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [deletedItemPopup, setDeletedItemPopup] = useState<FolderTreeItem | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const h = () => setCtxMenu(null);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [!!ctxMenu]);

  const clearSelection = useCallback(() => {
    setSelectedItemIds(new Set());
    setSelectedFolderIds(new Set());
  }, []);

  const getItemStatus = (item: FolderTreeItem): EntitySyncStatus | undefined => {
    const byPath = item.relPath ? pathStatusMap?.[item.relPath] : undefined;
    const byId = entitySyncStatus?.[item.id];
    if (item.relPath && pathStatusMap && !byPath && Object.keys(pathStatusMap).length > 0) {
      // Only log items in folders (relPath has 3 segments) to reduce noise
      if (item.relPath.split("/").length === 3) {
        const mapKeys = Object.keys(pathStatusMap).filter(k => k.split("/").length === 3);
        console.log("[FolderTree] MISS foldered item:", JSON.stringify(item.relPath), "| git foldered keys:", mapKeys.map(k => JSON.stringify(k)));
      }
    }
    return byPath ?? byId;
  };

  const toggle = (id: string) => setExpanded((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const expandAll = useCallback(() => setExpanded(new Set(["__root__", ...folders.map((f) => f.id)])), [folders]);
  const collapseAll = useCallback(() => setExpanded(new Set(["__root__"])), []);

  function buildTree(): FolderNode {
    const nodeMap = new Map<string | null, FolderNode>();
    nodeMap.set(null, { folder: null, children: [], items: [] });
    for (const f of folders) nodeMap.set(f.id, { folder: f, children: [], items: [] });
    for (const f of folders) {
      const parent = nodeMap.get(f.parentId ?? null) ?? nodeMap.get(null)!;
      parent.children.push(nodeMap.get(f.id)!);
    }
    for (const item of items) {
      const fid = item.folderId ?? null;
      const target = nodeMap.get(fid) ?? nodeMap.get(null)!;
      target.items.push(item);
    }
    return nodeMap.get(null)!;
  }

  const handleNewFolder = async (name: string, parentId: string | null) => {
    if (onBeforeCreateFolder && !onBeforeCreateFolder()) {
      setNewFolderParent(undefined);
      return;
    }
    await window.api.addFolder(kind, { name, parentId });
    onFoldersChange();
    setNewFolderParent(undefined);
    setExpanded((p) => { const s = new Set(p); s.add(parentId === null ? "__root__" : parentId); return s; });
  };

  const handleRenameFolder = async (id: string, name: string) => {
    await window.api.renameFolder(kind, id, name);
    onFoldersChange();
    setRenaming(null);
  };

  const handleDeleteFolder = async (id: string) => {
    await window.api.deleteFolder(kind, id);
    onFoldersChange();
  };

  // ── Menu builders ──────────────────────────────────────────────────────────

  const closeMenu = () => setCtxMenu(null);

  const sep: CtxMenuItem = { label: "", sep: true, action: () => { } };
  const expandAllItem: CtxMenuItem = { label: "Expand All", action: () => { expandAll(); closeMenu(); } };
  const collapseAllItem: CtxMenuItem = { label: "Collapse All", action: () => { collapseAll(); closeMenu(); } };

  function openEmptySpaceMenu(x: number, y: number) {
    const menuItems: CtxMenuItem[] = [
      {
        label: "New Subfolder", action: () => {
          setNewFolderParent(null);
          setExpanded((p) => { const s = new Set(p); s.add("__root__"); return s; });
          closeMenu();
        }
      },
    ];
    if (onOpenNewTab) {
      menuItems.push({ label: "New Tab", action: () => { onOpenNewTab(); closeMenu(); } });
    }
    menuItems.push(sep, expandAllItem, collapseAllItem);
    setCtxMenu({ x, y, items: menuItems });
  }

  function openFolderMenu(x: number, y: number, folderId: string | null) {
    const menuItems: CtxMenuItem[] = [
      {
        label: "New Subfolder", action: () => {
          setNewFolderParent(folderId);
          setExpanded((p) => { const s = new Set(p); s.add(folderId === null ? "__root__" : folderId); return s; });
          closeMenu();
        }
      },
    ];
    if (folderId !== null && onPublishFolder) {
      menuItems.push({ label: "Publish Folder", action: () => { onPublishFolder(folderId); closeMenu(); } });
    }
    if (folderId !== null && onToggleFolderItems) {
      menuItems.push(
        { label: "Enable All in Folder", action: () => { onToggleFolderItems(folderId, true); closeMenu(); } },
        { label: "Disable All in Folder", action: () => { onToggleFolderItems(folderId, false); closeMenu(); } },
      );
    }
    if (folderId !== null) {
      menuItems.push(
        { label: "Rename Folder", action: () => { setRenaming(folderId); closeMenu(); } },
        { label: "Delete Folder", danger: true, action: () => { handleDeleteFolder(folderId); clearSelection(); closeMenu(); } },
      );
    }
    menuItems.push(sep, expandAllItem, collapseAllItem);
    setCtxMenu({ x, y, items: menuItems });
  }

  function openItemMenu(x: number, y: number, item: FolderTreeItem) {
    const isEnabled = item.isEnabled !== false;
    const syncSt = getItemStatus(item);
    const isDeleted = syncSt === "deleted";
    const isTracked = !syncSt || syncSt === "clean" || syncSt === "modified" || syncSt === "deleted";
    const menuItems: CtxMenuItem[] = isDeleted
      ? []
      : [{ label: "Open in Tab", action: () => { onOpenItem(item.id); closeMenu(); } }];
    if (onPublishItem && syncSt && syncSt !== "clean") {
      menuItems.push({ label: isDeleted ? "Publish Deletion" : "Publish", action: () => { onPublishItem!(item.id); closeMenu(); } });
    }
    if (onRestoreItem && syncSt && syncSt !== "clean") {
      menuItems.push({ label: "Restore", action: () => { onRestoreItem!(item.id); closeMenu(); } });
    }
    if (!isDeleted && onToggleItem) {
      menuItems.push({ label: isEnabled ? "Disable" : "Enable", action: () => { onToggleItem(item.id); closeMenu(); } });
    }
    if (!isDeleted && onDuplicateItem) {
      menuItems.push({ label: "Duplicate", action: () => { onDuplicateItem(item.id); closeMenu(); } });
    }
    if (!isDeleted && onHistoryItem && isTracked) {
      menuItems.push({ label: "History", action: () => { onHistoryItem(item.id); closeMenu(); } });
    }
    if (!isDeleted) {
      menuItems.push(
        { label: "Delete", danger: true, action: () => { onDeleteItem(item.id); clearSelection(); closeMenu(); } },
        sep, expandAllItem, collapseAllItem,
      );
    } else {
      menuItems.push(sep, expandAllItem, collapseAllItem);
    }
    setCtxMenu({ x, y, items: menuItems });
  }

  function openMultiMenu(x: number, y: number) {
    const itemIds = [...selectedItemIds];
    const folderIds = [...selectedFolderIds];
    const hasItems = itemIds.length > 0;
    const hasFolders = folderIds.length > 0;
    const ni = itemIds.length;
    const nf = folderIds.length;
    const pl = (n: number, s: string) => `${n} ${s}${n !== 1 ? "s" : ""}`;

    const menuItems: CtxMenuItem[] = [];

    if (hasItems && !hasFolders) {
      const dirtyItems = onPublishItem ? itemIds.filter((id) => {
        const it = items.find((i) => i.id === id);
        const st = it ? getItemStatus(it) : undefined;
        return st && st !== "clean";
      }) : [];
      if (dirtyItems.length > 0 && onPublishItem) {
        menuItems.push({
          label: `Publish ${pl(dirtyItems.length, "item")}`, action: () => {
            dirtyItems.forEach((id) => onPublishItem!(id));
            clearSelection(); closeMenu();
          }
        });
      }
      if (onToggleItem) {
        menuItems.push(
          {
            label: `Enable ${pl(ni, "item")}`, action: () => {
              itemIds.forEach(id => { const it = items.find(i => i.id === id); if (it && it.isEnabled === false) onToggleItem(id); });
              clearSelection(); closeMenu();
            }
          },
          {
            label: `Disable ${pl(ni, "item")}`, action: () => {
              itemIds.forEach(id => { const it = items.find(i => i.id === id); if (it && it.isEnabled !== false) onToggleItem(id); });
              clearSelection(); closeMenu();
            }
          },
        );
      }
      if (onMoveItems) {
        menuItems.push({ label: `Move ${pl(ni, "item")}…`, action: () => { closeMenu(); setShowMove(true); } });
      }
      menuItems.push({ label: `Delete ${pl(ni, "item")}`, danger: true, action: () => { closeMenu(); setPendingDelete({ itemIds, folderIds: [] }); } });

    } else if (hasFolders && !hasItems) {
      menuItems.push(
        {
          label: `Expand ${pl(nf, "folder")}`, action: () => {
            setExpanded((p) => { const s = new Set(p); folderIds.forEach(id => s.add(id)); return s; });
            closeMenu();
          }
        },
        {
          label: `Collapse ${pl(nf, "folder")}`, action: () => {
            setExpanded((p) => { const s = new Set(p); folderIds.forEach(id => s.delete(id)); return s; });
            closeMenu();
          }
        },
        { label: `Delete ${pl(nf, "folder")}`, danger: true, action: () => { closeMenu(); setPendingDelete({ itemIds: [], folderIds }); } },
      );

    } else {
      // Mixed
      if (hasItems && onToggleItem) {
        menuItems.push(
          {
            label: `Enable ${pl(ni, "item")}`, action: () => {
              itemIds.forEach(id => { const it = items.find(i => i.id === id); if (it && it.isEnabled === false) onToggleItem(id); });
              clearSelection(); closeMenu();
            }
          },
          {
            label: `Disable ${pl(ni, "item")}`, action: () => {
              itemIds.forEach(id => { const it = items.find(i => i.id === id); if (it && it.isEnabled !== false) onToggleItem(id); });
              clearSelection(); closeMenu();
            }
          },
        );
      }
      menuItems.push({
        label: `Delete ${pl(ni + nf, "selected")}`,
        danger: true,
        action: () => { closeMenu(); setPendingDelete({ itemIds, folderIds }); },
      });
    }

    menuItems.push(sep, expandAllItem, collapseAllItem);
    setCtxMenu({ x, y, items: menuItems });
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────

  const doBulkDelete = () => {
    if (!pendingDelete) return;
    pendingDelete.itemIds.forEach(id => onDeleteItem(id));
    pendingDelete.folderIds.forEach(id => handleDeleteFolder(id));
    clearSelection();
    setPendingDelete(null);
  };

  const doMove = (folderId: string | null) => {
    onMoveItems?.([...selectedItemIds], folderId);
    clearSelection();
    setShowMove(false);
  };

  // ── Tree rendering ─────────────────────────────────────────────────────────

  const tree = buildTree();

  function renderNode(node: FolderNode, depth: number): React.ReactNode {
    const isRoot = node.folder === null;
    const nodeKey = isRoot ? "__root__" : node.folder!.id;
    const isExpanded = expanded.has(nodeKey);
    const isSel = !isRoot && selectedFolderIds.has(nodeKey);

    const folderRow = (
      <div
        key={`folder-row-${nodeKey}`}
        style={{
          position: "relative",
          display: "flex", alignItems: "center",
          height: 32, paddingRight: 8, paddingLeft: depth > 0 ? 0 : 4,
          gap: 4, borderRadius: 4, marginLeft: 2, marginRight: 4,
          cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
          background: isSel ? "rgba(var(--color-accent-rgb) / 0.1)" : undefined,
          outline: isSel ? "1px solid rgba(var(--color-accent-rgb) / 0.25)" : undefined,
        }}
        onClick={(e) => {
          e.stopPropagation();
          if ((e.ctrlKey || e.metaKey) && !isRoot) {
            setSelectedFolderIds((p) => { const s = new Set(p); s.has(nodeKey) ? s.delete(nodeKey) : s.add(nodeKey); return s; });
          } else {
            clearSelection();
            toggle(nodeKey);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault(); e.stopPropagation();
          const total = selectedItemIds.size + selectedFolderIds.size;
          if (total > 1 && !isRoot && selectedFolderIds.has(nodeKey)) {
            openMultiMenu(e.clientX, e.clientY);
          } else {
            setSelectedItemIds(new Set());
            setSelectedFolderIds(isRoot ? new Set() : new Set([nodeKey]));
            openFolderMenu(e.clientX, e.clientY, isRoot ? null : node.folder!.id);
          }
        }}
        onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = "var(--c-bg2)"; }}
        onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = ""; }}
      >
        {depth > 0 && (
          <div style={{ position: "absolute", left: -CONNECTOR_W, top: "50%", width: CONNECTOR_W - 2, height: 1, background: LINE_COLOR, transform: "translateY(-50%)", pointerEvents: "none" }} />
        )}
        <span style={{ flexShrink: 0, width: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--c-text-dim)", transition: "transform 0.15s ease", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <ChevronDown size={12} />
        </span>
        <span style={{ display: "flex", alignItems: "center", flexShrink: 0, color: "var(--c-text-dim)" }}>
          {isExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}
        </span>
        {renaming === nodeKey ? (
          <InlineInput
            value={node.folder?.name ?? ""}
            onCommit={(v) => handleRenameFolder(node.folder!.id, v)}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--c-text-bright)", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
            {isRoot ? "root" : node.folder!.name}
          </span>
        )}
        {(node.items.length > 0 || node.children.length > 0) && (
          <span style={{ fontSize: 9, color: "var(--c-text-dim)", flexShrink: 0, fontFamily: "monospace" }}>
            {node.items.length + node.children.reduce((a, c) => a + countItems(c), 0)}
          </span>
        )}
      </div>
    );

    const newFolderRow = newFolderParent !== undefined && newFolderParent === (isRoot ? null : node.folder?.id) && (
      <div key="new-folder-input" style={{ display: "flex", alignItems: "center", gap: 6, height: 28, paddingLeft: depth > 0 ? CONNECTOR_W + 4 : 4, paddingRight: 8, marginLeft: 2, marginRight: 4 }}>
        <Folder size={11} style={{ color: "var(--c-text-dim)", flexShrink: 0 }} />
        <InlineInput
          value=""
          onCommit={(v) => handleNewFolder(v, isRoot ? null : node.folder!.id)}
          onCancel={() => setNewFolderParent(undefined)}
        />
      </div>
    );

    // Pending-deleted items sort to the bottom within their folder
    const sortedItems = [...node.items].sort((a, b) => {
      const aDeleted = getItemStatus(a) === "deleted" ? 1 : 0;
      const bDeleted = getItemStatus(b) === "deleted" ? 1 : 0;
      return aDeleted - bDeleted;
    });

    return (
      <div key={nodeKey}>
        {folderRow}
        <div
          className="tree-folder-body"
          style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
        >
          <div className="tree-folder-inner" style={{ paddingLeft: CONNECTOR_W, marginLeft: INDENT, borderLeft: `1px solid ${LINE_COLOR}` }}>
            {newFolderRow}
            {node.children.map((child) => renderNode(child, depth + 1))}
            {sortedItems.map((item) => renderItem(item, depth + 1))}
          </div>
        </div>
      </div>
    );
  }

  function renderItem(item: FolderTreeItem, depth: number): React.ReactNode {
    const isActive = !!item.isActive;
    const isEnabled = item.isEnabled !== false;
    const isSel = selectedItemIds.has(item.id);
    const syncSt = getItemStatus(item);
    const isDeleted = syncSt === "deleted";

    // Text color reflects git status only — not enabled/disabled state
    const textColor = (() => {
      switch (syncSt) {
        case "new": return "var(--c-sync-new)";
        case "modified": return "var(--c-sync-modified)";
        case "deleted": return "var(--c-sync-modified)";
        case "clean": return "var(--c-sync-clean)";
        default: return "var(--c-text-bright)";
      }
    })();

    // Dot reflects enabled/disabled only
    const dotColor = isEnabled ? "var(--c-green)" : "var(--c-text-dim)";
    const dotOpacity = isEnabled ? 1 : 0.45;

    return (
      <div
        key={`item-${item.id}`}
        title={item.name}
        style={{
          position: "relative", display: "flex", alignItems: "center",
          height: 32, paddingLeft: 4, paddingRight: 8, gap: 5, borderRadius: 4, marginLeft: 2, marginRight: 4,
          cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
          background: isActive ? "var(--c-bg3)" : isSel ? "rgba(202,238,122,0.1)" : undefined,
          outline: isSel && !isActive ? "1px solid rgba(202,238,122,0.25)" : undefined,
          transition: "background 0.1s ease",
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey) {
            setSelectedItemIds((p) => { const s = new Set(p); s.has(item.id) ? s.delete(item.id) : s.add(item.id); return s; });
          } else if (isDeleted) {
            clearSelection();
            setDeletedItemPopup(item);
          } else {
            clearSelection();
            onOpenItem(item.id);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault(); e.stopPropagation();
          const total = selectedItemIds.size + selectedFolderIds.size;
          if (total > 1 && selectedItemIds.has(item.id)) {
            openMultiMenu(e.clientX, e.clientY);
          } else {
            setSelectedItemIds(new Set([item.id]));
            setSelectedFolderIds(new Set());
            openItemMenu(e.clientX, e.clientY, item);
          }
        }}
        onMouseEnter={(e) => {
          if (!isActive && !isSel) (e.currentTarget as HTMLDivElement).style.background = "var(--c-bg2)";
          setHoveredItemId(item.id);
        }}
        onMouseLeave={(e) => {
          if (!isActive && !isSel) (e.currentTarget as HTMLDivElement).style.background = "";
          setHoveredItemId(null);
        }}
      >
        {depth > 0 && (
          <div style={{ position: "absolute", left: -CONNECTOR_W, top: "50%", width: CONNECTOR_W - 2, height: 1, background: LINE_COLOR, transform: "translateY(-50%)", pointerEvents: "none" }} />
        )}
        {/* Enabled/disabled dot — at start, always visible */}
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 12 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: dotColor, opacity: dotOpacity }} />
        </span>
        {/* Method badge — shown when not hovered */}
        {item.method && hoveredItemId !== item.id && (
          <span style={{ flexShrink: 0, fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "2px 4px", borderRadius: 3, lineHeight: 1, color: methodColor(item.method), background: methodBg(item.method) }}>
            {item.method === "*" ? "ANY" : item.method}
          </span>
        )}
        {/* Name — text color = git status, strikethrough = pending delete */}
        <span style={{
          fontSize: 13, lineHeight: 1, flex: 1, overflow: "hidden", textOverflow: "ellipsis",
          color: textColor,
          textDecoration: isDeleted ? "line-through" : "none",
          opacity: !isEnabled ? 0.5 : 1,
        }}>
          {item.name}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, width: "100%" }}
      onContextMenu={(e) => {
        e.preventDefault();
        clearSelection();
        openEmptySpaceMenu(e.clientX, e.clientY);
      }}
    >
      <div style={{ minWidth: "max-content" }}>
        {renderNode(tree, 0)}
      </div>
      <div style={{ flex: 1, minHeight: 24 }} onClick={clearSelection} />

      {ctxMenu && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={closeMenu} />
      )}
      {showMove && (
        <MoveDialog folders={folders} onMove={doMove} onCancel={() => setShowMove(false)} />
      )}
      {pendingDelete && (
        <ConfirmDialog
          message={[
            pendingDelete.itemIds.length > 0 && `${pendingDelete.itemIds.length} item${pendingDelete.itemIds.length !== 1 ? "s" : ""}`,
            pendingDelete.folderIds.length > 0 && `${pendingDelete.folderIds.length} folder${pendingDelete.folderIds.length !== 1 ? "s" : ""}`,
          ].filter(Boolean).join(" and ") + " will be permanently deleted. Are you sure?"}
          onConfirm={doBulkDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {deletedItemPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setDeletedItemPopup(null)}
        >
          <div
            className="bg-bg2 border border-border rounded-lg shadow-2xl p-5 flex flex-col gap-4"
            style={{ minWidth: 300, maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-red)" }}>
              Pending Deletion
            </div>
            <div style={{ fontSize: 12, color: "var(--c-text-dim)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--c-text-bright)", fontWeight: 500 }}>{deletedItemPopup.name}</span>
              {" "}has been deleted locally but not yet published. Publish to commit the deletion to git, or restore to undo.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="px-3 py-1.5 text-xs rounded border border-border hover:bg-bg3 text-text-base cursor-pointer"
                onClick={() => setDeletedItemPopup(null)}
              >
                Cancel
              </button>
              {onRestoreItem && (
                <button
                  className="px-3 py-1.5 text-xs rounded border border-accent text-accent hover:bg-accent/10 cursor-pointer"
                  onClick={() => { onRestoreItem(deletedItemPopup.id); setDeletedItemPopup(null); }}
                >
                  Restore
                </button>
              )}
              {onPublishItem && (
                <button
                  className="px-3 py-1.5 text-xs rounded bg-red/80 hover:bg-red text-white cursor-pointer"
                  onClick={() => { onPublishItem(deletedItemPopup.id); setDeletedItemPopup(null); }}
                >
                  Publish Deletion
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function countItems(node: FolderNode): number {
  return node.items.length + node.children.reduce((a, c) => a + countItems(c), 0);
}
