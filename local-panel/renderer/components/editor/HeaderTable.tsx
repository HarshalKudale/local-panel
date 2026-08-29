import React, { useState, useEffect } from "react";
import { KVRow, mkRowId } from "@/lib/utils";
import { strings } from "@/lib/strings";
import { X } from "@/lib/icons";

interface Props {
  rows: KVRow[];
  onChange: (rows: KVRow[]) => void;
  readOnly?: boolean;
  emptyMessage?: string;
  mockControls?: {
    allMocked: boolean;
    anyMocked: boolean;
    onToggleAll: (mocked: boolean) => void;
  };
}

export default function HeaderTable({ rows, onChange, readOnly = false, emptyMessage, mockControls }: Props) {
  const update = (id: string, patch: Partial<KVRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const addRow = () => onChange([...rows, { id: mkRowId(), enabled: true, key: "", value: "" }]);

  const defaultEmpty = readOnly ? strings.common.noHeaders : strings.common.noHeadersAddRow;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b border-border/60 bg-bg0/20 flex-shrink-0">
        {!readOnly && <div className="w-9 flex-shrink-0 border-r border-border/40" />}
        {mockControls && !readOnly && (
          <div className="w-20 flex-shrink-0 border-r border-border/40 px-2 py-1.5">
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1 text-[10px] text-text-dim cursor-pointer">
                <input
                  type="checkbox"
                  checked={mockControls.allMocked}
                  onChange={(e) => mockControls.onToggleAll(e.target.checked)}
                  className="accent-accent cursor-pointer"
                />
                <span>Mock all</span>
              </label>
              <button
                type="button"
                onClick={() => mockControls.onToggleAll(false)}
                disabled={!mockControls.anyMocked}
                className="text-left text-[10px] text-text-dim hover:text-text-base disabled:opacity-40 cursor-pointer"
              >
                Unmock all
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim border-r border-border/40">
          {strings.common.key}
        </div>
        <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
          {strings.common.value}
        </div>
        {!readOnly && <div className="w-9 flex-shrink-0" />}
      </div>

      {rows.length === 0 && (
        <p className="px-4 py-5 text-xs text-text-dim italic">{emptyMessage ?? defaultEmpty}</p>
      )}

      {rows.map((row) => (
        <div
          key={row.id}
          className={`flex items-stretch border-b border-border/25 last:border-0 group hover:bg-bg2/30 transition-colors ${
            !row.enabled && !readOnly ? "opacity-40" : ""
          }`}
        >
          {!readOnly && (
            <div className="w-9 flex-shrink-0 flex items-center justify-center border-r border-border/30">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => update(row.id, { enabled: e.target.checked })}
                className="accent-accent cursor-pointer"
              />
            </div>
          )}
          {mockControls && !readOnly && (
            <div className="w-20 flex-shrink-0 flex items-center justify-center border-r border-border/30">
              <label className="flex items-center gap-1.5 text-[10px] text-text-dim cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!row.mocked}
                  onChange={(e) => update(row.id, { mocked: e.target.checked })}
                  className="accent-accent cursor-pointer"
                />
                <span>Mock</span>
              </label>
            </div>
          )}
          <div className="flex-1 border-r border-border/25 min-w-0">
            <input
              className="w-full h-full bg-transparent font-mono text-xs px-3 py-2 outline-none focus:bg-bg2/60 min-w-0"
              style={{ color: "var(--c-accent)" }}
              placeholder={readOnly ? "—" : strings.editor.placeholderKey}
              value={row.key}
              onChange={(e) => update(row.id, { key: e.target.value })}
              readOnly={readOnly}
              tabIndex={readOnly ? -1 : undefined}
            />
          </div>
          <div className="flex-1 min-w-0">
            <input
              className="w-full h-full bg-transparent font-mono text-xs text-text-bright px-3 py-2 outline-none focus:bg-bg2/60 min-w-0"
              placeholder={readOnly ? "—" : strings.editor.placeholderValue}
              value={row.value}
              onChange={(e) => update(row.id, { value: e.target.value })}
              readOnly={readOnly}
              tabIndex={readOnly ? -1 : undefined}
            />
          </div>
          {!readOnly && (
            <button
              onClick={() => remove(row.id)}
              className="w-9 flex-shrink-0 flex items-center justify-center text-text-dim hover:text-red opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}

      {!readOnly && (
        <button
          onClick={addRow}
          className="flex items-center gap-2 px-4 py-2.5 text-xs text-text-dim hover:text-text-base hover:bg-bg2/30 transition-colors cursor-pointer text-left border-t border-border/20"
        >
          <span className="text-accent font-semibold text-sm leading-none">+</span>
          {strings.common.addRow}
        </button>
      )}
    </div>
  );
}

// Separate named export to satisfy existing imports from MockEditorModal
export { HeaderTable };
