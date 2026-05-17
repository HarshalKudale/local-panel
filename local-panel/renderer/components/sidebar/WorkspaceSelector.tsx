import React, { useState, useRef, useEffect } from "react";
import { Workspace } from "@/types";
import { Layers, ChevronDown, Plus, Pencil, Trash2 } from "@/lib/icons";

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
        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-bg2 text-text-dim hover:bg-bg3 hover:text-text-base text-xs font-medium transition-colors cursor-pointer"
        title="Switch workspace"
      >
        <Layers size={11} />
        <span className="max-w-[120px] truncate">{active?.name ?? "Workspace"}</span>
        <ChevronDown size={10} className="opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-bg2 border border-border rounded-md shadow-2xl py-1 min-w-[230px] animate-scale-in">
            {/* Create workspace button */}
            <button
              onClick={() => { onCreate(); close(); }}
              className="w-full text-left px-3 py-1.5 text-xs text-accent hover:bg-bg3 cursor-pointer transition-colors flex items-center gap-1.5 border-b border-border/60"
            >
              <Plus size={12} />
              Create Workspace
            </button>

            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
              Workspaces
            </div>

            {workspaces.map((ws) => {
              const isConfirming = confirmDeleteId === ws.id;
              return (
                <div key={ws.id}>
                  <div
                    className={`group flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-bg3 ${activeId === ws.id ? "text-accent font-semibold" : "text-text-base"}`}
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
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeId === ws.id ? "bg-accent" : "bg-text-dim/30"}`}
                      style={{ boxShadow: activeId === ws.id ? "0 0 4px var(--c-accent)" : "none" }}
                    />
                    {renamingId === ws.id ? (
                      <input
                        ref={renameRef}
                        className="flex-1 min-w-0 bg-bg3 border border-accent/40 rounded px-1.5 py-0.5 text-xs text-text-bright outline-none"
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
                          className="text-text-dim hover:text-accent text-[10px] px-1 py-0.5 rounded transition-colors cursor-pointer"
                          title="Rename workspace"
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
                            className="text-text-dim hover:text-red text-[10px] px-1 py-0.5 rounded transition-colors cursor-pointer"
                            title="Delete workspace"
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
                      className="mx-3 mb-1.5 px-2.5 py-2 rounded border border-red/30 bg-red/5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-[10px] text-text-dim leading-snug mb-2">
                        Delete <span className="font-semibold text-text-base">"{ws.name}"</span>? All data in this workspace will be permanently removed.
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDeleteConfirm(ws.id)}
                          className="flex-1 px-2 py-1 rounded bg-red/15 border border-red/40 text-red text-[10px] font-semibold hover:bg-red/25 cursor-pointer transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="flex-1 px-2 py-1 rounded bg-bg3 border border-border text-text-dim text-[10px] hover:text-text-base cursor-pointer transition-colors"
                        >
                          Cancel
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
