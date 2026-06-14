import React, { useState, useEffect, useRef, useCallback } from "react";
import { Folder as FolderType } from "@/types";
import { ChevronDown, Folder, FolderOpen, Play, ArrowUp, History, Copy, Trash2, Pencil, Plus, ChevronsUpDown, ToggleLeft, ToggleRight, ExternalLink, Ban } from "@/lib/icons";
import { methodColor, methodBg } from "@/lib/utils";
import ActiveDot from "@/components/ui/ActiveDot";
import SyncIndicator from "@/components/ui/SyncIndicator";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ContextMenu, { ContextMenuItem } from "@/components/ui/ContextMenu";
import { strings } from "@/lib/strings";

// -- Types ------------------------------------------------------------------

export interface FolderTreeItem {
  id: string;
  name: string;
  method?: string;
  folderId?: string | null;
  isActive?: boolean;
  isEnabled?: boolean;
  /** Relative git path e.g. "mocks/FolderName/id.json" - used for path-keyed status lookup */
  relPath?: string;
  /** True for special runner config nodes that open the collection runner when clicked */
  isRunner?: boolean;
  /** True for application-managed block mocks (live in the Blocks folder, non-editable) */
  isBlock?: boolean;
}

interface FolderNode {
  folder: FolderType | null;
  children: FolderNode[];
  items: FolderTreeItem[];
}

// CtxMenuItem alias for backward compat within this file
type CtxMenuItem = ContextMenuItem;

// -- Inline rename input (used only for new folder creation) -------------------

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

// -- Rename dialog modal ----------------------------------------------------

function RenameDialog({ currentName, onSave, onCancel }: {
  currentName: string;
  onSave(name: string): void;
  onCancel(): void;
}) {
  const [val, setVal] = useState(currentName);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const handleSave = () => {
    const trimmed = val.trim();
    if (trimmed && trimmed !== currentName) onSave(trimmed);
    else onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onCancel}
    >
      <div
        className="bg-bg2 border border-border rounded-lg shadow-2xl p-4 w-72"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); handleSave(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
      >
        <div className="text-xs font-semibold text-text-base mb-3">{strings.folderTree.renameFolder}</div>
        <input
          ref={ref}
          className="w-full bg-bg3 border border-border focus:border-accent rounded px-2 py-1.5 text-xs text-text-bright outline-none mb-4"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded border border-border hover:bg-bg3 text-text-dim cursor-pointer"
            onClick={onCancel}
          >
            {strings.common.cancel}
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded font-semibold cursor-pointer"
            style={{ background: "var(--c-accent)", color: "#fff", opacity: val.trim() ? 1 : 0.5 }}
            disabled={!val.trim()}
            onClick={handleSave}
          >
            {strings.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Move to folder dialog --------------------------------------------------

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
          {strings.folderTree.moveToFolder}
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg3 text-text-dim cursor-pointer"
            onClick={() => onMove(null)}
          >
            {strings.folderTree.slashRoot}
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
            {strings.common.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}


const INDENT = 14;
const LINE_COLOR = "var(--c-border)";
const CONNECTOR_W = 12;

// -- FolderTree -------------------------------------------------------------

export type EntitySyncStatus = "clean" | "modified" | "new" | "deleted";
export type FolderStatus = "enabled" | "mixed" | "disabled";

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
  /** Map of relative git path -> sync status for color-coded indicators (preferred) */
  pathStatusMap?: Record<string, EntitySyncStatus>;
  /** @deprecated use pathStatusMap (entity-ID-keyed fallback, kept for flat entities like mappings) */
  entitySyncStatus?: Record<string, EntitySyncStatus>;
  /** Map of folder ID -> enable status (green=all enabled, orange=mixed, red=all disabled). Only for folders with enableable items. */
  folderStatusMap?: Record<string, FolderStatus>;
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
  /** Called when user clicks "Open in Runner" for a folder */
  onOpenRunner?: (folderId: string) => void;
  /** Called synchronously before a folder is deleted - lets the parent close open tabs for items in that folder */
  onBeforeDeleteFolder?: (folderId: string) => void;
  /** Id of the application-managed "Blocks" folder, if it exists. Used to protect it and render block items specially. */
  blocksFolderId?: string | null;
  /** Convert a normal mock into a block (move to Blocks folder, force 403). */
  onBlockItem?: (id: string) => void;
  /** Remove a block (delete the block mock). */
  onUnblockItem?: (id: string) => void;
}

export default function FolderTree({
  kind, folders, items, onOpenItem, onDeleteItem, onToggleItem, onToggleFolderItems, onFoldersChange,
  onDuplicateItem, onMoveItems, onOpenNewTab, onHistoryItem,
  pathStatusMap, entitySyncStatus, folderStatusMap, onPublishItem, onPublishFolder, onRestoreItem,
  onBeforeCreateFolder, onOpenRunner, onBeforeDeleteFolder,
  blocksFolderId, onBlockItem, onUnblockItem,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["__root__"]));
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [showMove, setShowMove] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ itemIds: string[]; folderIds: string[]; hasTracked?: boolean } | null>(null);
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
    onBeforeDeleteFolder?.(id);
    await window.api.deleteFolder(kind, id);
    onFoldersChange();
  };

  // -- Menu builders ----------------------------------------------------------

  const closeMenu = () => setCtxMenu(null);

  const sep: CtxMenuItem = { sep: true, action: () => { } };
  const expandAllItem: CtxMenuItem  = { label: strings.folderTree.expandAll,   icon: <ChevronsUpDown size={11} />, action: () => { expandAll();   closeMenu(); } };
  const collapseAllItem: CtxMenuItem = { label: strings.folderTree.collapseAll, icon: <ChevronsUpDown size={11} />, action: () => { collapseAll(); closeMenu(); } };

  function openEmptySpaceMenu(x: number, y: number) {
    const menuItems: CtxMenuItem[] = [
      { label: strings.folderTree.newSubfolder, icon: <Plus size={11} />, action: () => { setNewFolderParent(null); setExpanded((p) => { const s = new Set(p); s.add("__root__"); return s; }); closeMenu(); } },
    ];
    if (onOpenNewTab) {
      menuItems.push({ label: strings.folderTree.newTab, icon: <Plus size={11} />, action: () => { onOpenNewTab(); closeMenu(); } });
    }
    menuItems.push(sep, expandAllItem, collapseAllItem);
    setCtxMenu({ x, y, items: menuItems });
  }

  function openFolderMenu(x: number, y: number, folderId: string | null) {
    // The application-managed Blocks folder is protected: no rename/delete/subfolders.
    if (folderId !== null && folderId === blocksFolderId) {
      setCtxMenu({ x, y, items: [expandAllItem, collapseAllItem] });
      return;
    }
    const menuItems: CtxMenuItem[] = [
      { label: strings.folderTree.newSubfolder, icon: <Plus size={11} />, action: () => { setNewFolderParent(folderId); setExpanded((p) => { const s = new Set(p); s.add(folderId === null ? "__root__" : folderId); return s; }); closeMenu(); } },
    ];
    if (folderId !== null && onPublishFolder) {
      menuItems.push({ label: strings.folderTree.commitPushFolder, icon: <ArrowUp size={11} />, action: () => { onPublishFolder(folderId); closeMenu(); } });
    }
    if (folderId !== null && onToggleFolderItems) {
      menuItems.push(
        { label: strings.folderTree.enableAllInFolder,  icon: <ToggleRight size={11} />, action: () => { onToggleFolderItems(folderId, true);  closeMenu(); } },
        { label: strings.folderTree.disableAllInFolder, icon: <ToggleLeft  size={11} />, action: () => { onToggleFolderItems(folderId, false); closeMenu(); } },
      );
    }
    if (folderId !== null) {
      menuItems.push(
        { label: strings.folderTree.renameFolder, icon: <Pencil size={11} />, action: () => { setRenaming(folderId); closeMenu(); } },
        { label: strings.folderTree.deleteFolder, icon: <Trash2 size={11} />, danger: true, action: () => { setPendingDelete({ itemIds: [], folderIds: [folderId] }); clearSelection(); closeMenu(); } },
      );
    }
    if (folderId !== null && onOpenRunner) {
      menuItems.push({ label: strings.folderTree.runCollection, icon: <Play size={11} />, action: () => { onOpenRunner(folderId); closeMenu(); } });
    }
    menuItems.push(sep, expandAllItem, collapseAllItem);
    setCtxMenu({ x, y, items: menuItems });
  }

  function openItemMenu(x: number, y: number, item: FolderTreeItem) {
    // Block items are application-managed and non-editable - only Unblock is offered.
    if (item.isBlock) {
      const blockMenu: CtxMenuItem[] = [];
      if (onUnblockItem) {
        blockMenu.push({ label: strings.folderTree.unblock, icon: <Ban size={11} />, action: () => { onUnblockItem(item.id); closeMenu(); } });
      }
      blockMenu.push(sep, expandAllItem, collapseAllItem);
      setCtxMenu({ x, y, items: blockMenu });
      return;
    }
    const isEnabled = item.isEnabled !== false;
    const syncSt = getItemStatus(item);
    const isDeleted = syncSt === "deleted";
    const isTracked = !syncSt || syncSt === "clean" || syncSt === "modified" || syncSt === "deleted";
    const isNew = syncSt === "new";
    const menuItems: CtxMenuItem[] = isDeleted
      ? []
      : [{ label: strings.folderTree.open, icon: <ExternalLink size={11} />, action: () => { onOpenItem(item.id); closeMenu(); } }];
    if (onPublishItem && syncSt && syncSt !== "clean") {
      menuItems.push({
        label: isDeleted ? strings.folderTree.commitDelete : strings.folderTree.commitPush,
        icon: <ArrowUp size={11} />,
        action: () => { onPublishItem!(item.id); closeMenu(); },
      });
    }
    if (onRestoreItem && syncSt && syncSt !== "clean") {
      menuItems.push({
        label: isDeleted ? strings.folderTree.restore : strings.folderTree.discardChanges,
        icon: <History size={11} />,
        action: () => { onRestoreItem!(item.id); closeMenu(); },
      });
    }
    if (!isDeleted && onToggleItem) {
      menuItems.push({
        label: isEnabled ? strings.folderTree.disable : strings.folderTree.enable,
        icon: isEnabled ? <ToggleLeft size={11} /> : <ToggleRight size={11} />,
        action: () => { onToggleItem(item.id); closeMenu(); },
      });
    }
    if (!isDeleted && onDuplicateItem) {
      menuItems.push({ label: strings.folderTree.duplicate, icon: <Copy size={11} />, action: () => { onDuplicateItem(item.id); closeMenu(); } });
    }
    if (!isDeleted && onHistoryItem && isTracked) {
      menuItems.push({ label: strings.folderTree.history, icon: <History size={11} />, action: () => { onHistoryItem(item.id); closeMenu(); } });
    }
    if (!isDeleted && onBlockItem) {
      menuItems.push({ label: strings.folderTree.block, icon: <Ban size={11} />, action: () => { onBlockItem(item.id); closeMenu(); } });
    }
    if (!isDeleted) {
      menuItems.push(
        { label: strings.folderTree.delete, icon: <Trash2 size={11} />, danger: true, action: () => { setPendingDelete({ itemIds: [item.id], folderIds: [], hasTracked: !isNew }); clearSelection(); closeMenu(); } },
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
    const fmt = (tpl: string, n: number) => tpl.replace(/\{n\}/g, String(n)).replace(/\{s\}/g, n !== 1 ? "s" : "");
    const items_ = (n: number) => fmt(strings.folderTree.nItems, n);
    const folders_ = (n: number) => fmt(strings.folderTree.nFolders, n);

    const menuItems: CtxMenuItem[] = [];

    if (hasItems && !hasFolders) {
      const dirtyItems = onPublishItem ? itemIds.filter((id) => {
        const it = items.find((i) => i.id === id);
        const st = it ? getItemStatus(it) : undefined;
        return st && st !== "clean";
      }) : [];
      if (dirtyItems.length > 0 && onPublishItem) {
        menuItems.push({
          label: `${strings.folderTree.commitPush} ${items_(dirtyItems.length)}`,
          icon: <ArrowUp size={11} />,
          action: () => { dirtyItems.forEach((id) => onPublishItem!(id)); clearSelection(); closeMenu(); },
        });
      }
      if (onToggleItem) {
        menuItems.push(
          { label: `${strings.folderTree.enable} ${items_(ni)}`,  icon: <ToggleRight size={11} />, action: () => { itemIds.forEach(id => { const it = items.find(i => i.id === id); if (it && it.isEnabled === false) onToggleItem(id); }); clearSelection(); closeMenu(); } },
          { label: `${strings.folderTree.disable} ${items_(ni)}`, icon: <ToggleLeft  size={11} />, action: () => { itemIds.forEach(id => { const it = items.find(i => i.id === id); if (it && it.isEnabled !== false) onToggleItem(id); }); clearSelection(); closeMenu(); } },
        );
      }
      if (onMoveItems) {
        menuItems.push({ label: `${strings.folderTree.move} ${items_(ni)}…`, action: () => { closeMenu(); setShowMove(true); } });
      }
      menuItems.push({ label: `${strings.folderTree.delete} ${items_(ni)}`, icon: <Trash2 size={11} />, danger: true, action: () => { closeMenu(); setPendingDelete({ itemIds, folderIds: [] }); } });

    } else if (hasFolders && !hasItems) {
      menuItems.push(
        {
          label: `${strings.folderTree.expand} ${folders_(nf)}`, action: () => {
            setExpanded((p) => { const s = new Set(p); folderIds.forEach(id => s.add(id)); return s; });
            closeMenu();
          }
        },
        {
          label: `${strings.folderTree.collapse} ${folders_(nf)}`, action: () => {
            setExpanded((p) => { const s = new Set(p); folderIds.forEach(id => s.delete(id)); return s; });
            closeMenu();
          }
        },
        { label: `${strings.folderTree.delete} ${folders_(nf)}`, danger: true, action: () => { closeMenu(); setPendingDelete({ itemIds: [], folderIds }); } },
      );

    } else {
      // Mixed
      if (hasItems && onToggleItem) {
        menuItems.push(
          {
            label: `${strings.folderTree.enable} ${items_(ni)}`, action: () => {
              itemIds.forEach(id => { const it = items.find(i => i.id === id); if (it && it.isEnabled === false) onToggleItem(id); });
              clearSelection(); closeMenu();
            }
          },
          {
            label: `${strings.folderTree.disable} ${items_(ni)}`, action: () => {
              itemIds.forEach(id => { const it = items.find(i => i.id === id); if (it && it.isEnabled !== false) onToggleItem(id); });
              clearSelection(); closeMenu();
            }
          },
        );
      }
      menuItems.push({
        label: `${strings.folderTree.delete} ${fmt(strings.folderTree.nSelected, ni + nf)}`,
        danger: true,
        action: () => { closeMenu(); setPendingDelete({ itemIds, folderIds }); },
      });
    }

    menuItems.push(sep, expandAllItem, collapseAllItem);
    setCtxMenu({ x, y, items: menuItems });
  }

  // -- Bulk actions -----------------------------------------------------------

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

  // -- Tree rendering ---------------------------------------------------------

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
        {/* Folder status dot (only for folders with enableable items) */}
        {folderStatusMap && !isRoot && node.folder && folderStatusMap[node.folder.id] && (() => {
          const fs = folderStatusMap[node.folder.id];
          return (
            <ActiveDot
              active={fs === "enabled"}
              color={fs === "enabled" ? "green" : fs === "mixed" ? "yellow" : "red"}
              size="sm"
            />
          );
        })()}
        <span style={{ display: "flex", alignItems: "center", flexShrink: 0, color: "var(--c-text-dim)" }}>
          {isExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}
        </span>
        {renaming === nodeKey ? (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--c-accent)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontStyle: "italic" }}>
            {node.folder!.name}
          </span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--c-text-bright)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {isRoot ? strings.folderTree.root : node.folder!.name}
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
          if (item.isRunner) {
            clearSelection();
            if (onOpenRunner && item.folderId) onOpenRunner(item.folderId);
            else onOpenItem(item.id);
            return;
          }
          if (item.isBlock) {
            // Block items are non-editable; clicking does not open an editor.
            clearSelection();
            return;
          }
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
          if (item.isRunner) return; // no context menu for runner items
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
        {item.isRunner ? (
          // Runner item: play icon + label, no dot/method badge
          <>
            <span style={{ flexShrink: 0, display: "flex", alignItems: "center", color: "var(--c-accent)", opacity: 0.8 }}>
              <Play size={11} fill="currentColor" />
            </span>
            <span style={{ fontSize: 12, lineHeight: 1, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", color: "var(--c-accent)", fontStyle: "italic", opacity: 0.85 }}>
              {item.name}
            </span>
          </>
        ) : (
          <>
            {/* Block items show a ban marker; normal items show enabled/sync dots */}
            <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 2 }}>
              {item.isBlock ? (
                <Ban size={12} style={{ color: "var(--c-red)" }} />
              ) : (
                <>
                  <ActiveDot active={isEnabled} color="green" size="sm" />
                  <SyncIndicator status={syncSt} />
                </>
              )}
            </span>
            {/* Method badge - shown when not hovered */}
            {item.method && hoveredItemId !== item.id && (
              <span style={{ flexShrink: 0, fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "2px 4px", borderRadius: 3, lineHeight: 1, color: methodColor(item.method), background: methodBg(item.method) }}>
                {item.method === "*" ? "ANY" : item.method}
              </span>
            )}
            {/* Name - theme color, strikethrough = pending delete or block, dim = disabled/block */}
            <span style={{
              fontSize: 13, lineHeight: 1, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              color: "var(--c-text-bright)",
              textDecoration: isDeleted || item.isBlock ? "line-through" : "none",
              opacity: !isEnabled || item.isBlock ? 0.6 : 1,
            }}>
              {item.name}
            </span>
          </>
        )}
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
      <div style={{ width: "100%", overflow: "hidden" }}>
        {renderNode(tree, 0)}
      </div>
      <div style={{ flex: 1, minHeight: 24 }} onClick={clearSelection} />

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={closeMenu} />
      )}
      {showMove && (
        <MoveDialog folders={folders} onMove={doMove} onCancel={() => setShowMove(false)} />
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        message={pendingDelete ? (() => {
          const plural = (tpl: string, n: number) => tpl.replace(/\{n\}/g, String(n)).replace(/\{s\}/g, n !== 1 ? "s" : "");
          const what = [
            pendingDelete.itemIds.length > 0 && plural(strings.folderTree.nItems, pendingDelete.itemIds.length),
            pendingDelete.folderIds.length > 0 && plural(strings.folderTree.nFolders, pendingDelete.folderIds.length),
          ].filter(Boolean).join(strings.folderTree.and);
          return pendingDelete.hasTracked
            ? strings.folderTree.deleteConfirmTracked.replace("{what}", what)
            : strings.folderTree.deleteConfirmUntracked.replace("{what}", what);
        })() : ""}
        onConfirm={doBulkDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {renaming && (() => {
        const folder = folders.find((f) => f.id === renaming);
        return folder ? (
          <RenameDialog
            currentName={folder.name}
            onSave={(name) => handleRenameFolder(folder.id, name)}
            onCancel={() => setRenaming(null)}
          />
        ) : null;
      })()}
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
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-sync-modified)" }}>
              {strings.folderTree.pendingDeletion}
            </div>
            <div style={{ fontSize: 12, color: "var(--c-text-dim)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--c-text-bright)", fontWeight: 500 }}>{deletedItemPopup.name}</span>
              {" "}{strings.folderTree.pendingDeletionBody}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="px-3 py-1.5 text-xs rounded border border-border hover:bg-bg3 text-text-base cursor-pointer"
                onClick={() => setDeletedItemPopup(null)}
              >
                {strings.common.cancel}
              </button>
              {onRestoreItem && (
                <button
                  className="px-3 py-1.5 text-xs rounded border border-accent text-accent hover:bg-accent/10 cursor-pointer"
                  onClick={() => { onRestoreItem(deletedItemPopup.id); setDeletedItemPopup(null); }}
                >
                  {strings.folderTree.restore}
                </button>
              )}
              {onPublishItem && (
                <button
                  className="px-3 py-1.5 text-xs rounded bg-red/80 hover:bg-red text-white cursor-pointer"
                  onClick={() => { onPublishItem(deletedItemPopup.id); setDeletedItemPopup(null); }}
                >
                  {strings.folderTree.commitDelete}
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
