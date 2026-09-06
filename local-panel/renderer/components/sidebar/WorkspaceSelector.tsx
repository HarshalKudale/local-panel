import React, { useState, useRef, useEffect } from "react";
import { Workspace } from "@/types";
import { Layers, ChevronDown, Plus, Pencil, Trash2 } from "@/lib/icons";
import { strings } from "@/lib/strings";

interface Props {
  workspaces: Workspace[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function WorkspaceSelector({ workspaces, activeId, onSelect, onCreate, onRename, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const active = workspaces.find((w) => w.id === activeId);
  const canDelete = workspaces.length > 1;

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  const close = () => {
    setOpen(false);
    setRenamingId(null);
    setConfirmDeleteId(null);
  };

  const handleRenameCommit = (id: string) => {
    const name = renameValue.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
    setRenameValue("");
  };

  const handleDeleteConfirm = (id: string) => {
    onDelete(id);
    setConfirmDeleteId(null);
    setOpen(false);
  };

  return (
    <div
      ref={dropdownRef}
      className="relative flex-shrink-0"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <button
        onClick={() => { setOpen((v) => !v); setRenamingId(null); setConfirmDeleteId(null); }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground text-xs font-medium transition-colors cursor-pointer"
        title={strings.sidebar.switchWorkspace}
      >
        <Layers size={11} />
        <span className="max-w-[120px] truncate">{active?.name ?? strings.sidebar.workspace}</span>
        <ChevronDown size={10} className="opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-md shadow-2xl py-1 min-w-[230px] animate-scale-in">
            {/* Create workspace button */}
            <button
              onClick={() => { onCreate(); close(); }}
              className="w-full text-left px-3 py-1.5 text-xs text-signal hover:bg-surface-2 cursor-pointer transition-colors flex items-center gap-1.5 border-b border-border/60"
            >
              <Plus size={12} />
              {strings.sidebar.createWorkspace}
            </button>

            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {strings.sidebar.workspaces}
            </div>

            {workspaces.map((ws) => {
              const isConfirming = confirmDeleteId === ws.id;
              return (
                <div key={ws.id}>
                  <div
                    className={`group flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-surface-2 ${activeId === ws.id ? "text-signal font-semibold" : "text-foreground"}`}
                    onClick={() => {
                      if (renamingId !== ws.id && !isConfirming) {
                        onSelect(ws.id);
                        setOpen(false);
                        setRenamingId(null);
                        setConfirmDeleteId(null);
                      }
                    }}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeId === ws.id ? "bg-signal" : "bg-muted-foreground/30"}`}
                      style={{ boxShadow: activeId === ws.id ? "0 0 4px var(--c-signal)" : "none" }}
                    />
                    {renamingId === ws.id ? (
                      <input
                        ref={renameRef}
                        className="flex-1 min-w-0 bg-surface-2 border border-signal/40 rounded px-1.5 py-0.5 text-xs text-foreground outline-none"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") handleRenameCommit(ws.id);
                          if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                        }}
                        onBlur={() => handleRenameCommit(ws.id)}
                      />
                    ) : (
                      <span className="flex-1 truncate">{ws.name}</span>
                    )}
                    {renamingId !== ws.id && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          className="text-muted-foreground hover:text-signal text-[10px] px-1 py-0.5 rounded transition-colors cursor-pointer"
                          title={strings.sidebar.renameWorkspace}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(ws.id);
                            setRenameValue(ws.name);
                            setConfirmDeleteId(null);
                          }}
                        >
                          <Pencil size={10} />
                        </button>
                        {canDelete && (
                          <button
                            className="text-muted-foreground hover:text-destructive text-[10px] px-1 py-0.5 rounded transition-colors cursor-pointer"
                            title={strings.sidebar.deleteWorkspace}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(isConfirming ? null : ws.id);
                              setRenamingId(null);
                            }}
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inline delete confirmation */}
                  {isConfirming && (
                    <div
                      className="mx-3 mb-1.5 px-2.5 py-2 rounded border border-destructive/30 bg-destructive/5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-[10px] text-muted-foreground leading-snug mb-2">
                        {strings.sidebar.deleteWorkspacePrefix} <span className="font-semibold text-foreground">"{ws.name}"</span>{strings.sidebar.deleteWorkspaceSuffix}
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDeleteConfirm(ws.id)}
                          className="flex-1 px-2 py-1 rounded bg-destructive/15 border border-destructive/40 text-destructive text-[10px] font-semibold hover:bg-destructive/25 cursor-pointer transition-colors"
                        >
                          {strings.common.delete}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="flex-1 px-2 py-1 rounded bg-surface-2 border border-border text-muted-foreground text-[10px] hover:text-foreground cursor-pointer transition-colors"
                        >
                          {strings.common.cancel}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
