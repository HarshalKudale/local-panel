import React, { useState } from "react";
import { Environment } from "@/types";
import { strings } from "@/lib/strings";

interface Props {
  env: Environment | null;
  onInsert: (token: string) => void;
}

/**
 * Small button that opens a popover listing available variables.
 * Clicking a variable calls onInsert("{{KEY}}") so the caller can
 * append it to whichever input is focused.
 */
export default function EnvVarHint({ env, onInsert }: Props) {
  const [open, setOpen] = useState(false);

  if (!env || env.variables.length === 0) return null;

  return (
    <div className="relative flex-shrink-0" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        title={strings.editor.activeEnv.replace("{name}", env.name)}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-accent text-[10px] font-mono transition-colors cursor-pointer"
      >
        <span className="text-accent/70">{"{{"}</span>
        <span className="text-text-dim">{env.name.slice(0, 10)}</span>
        <span className="text-accent/70">{"}}"}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 z-50 bg-bg2 border border-border rounded-md shadow-2xl py-1 min-w-[200px] max-h-64 overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim border-b border-border/60">
              {strings.editor.variablesHeader.replace("{name}", env.name)}
            </div>
            {env.variables.filter((v) => v.key.trim()).map((v) => (
              <button
                key={v.id}
                onClick={() => { onInsert(`{{${v.key}}}`); setOpen(false); }}
                className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs cursor-pointer hover:bg-bg3 text-left group"
              >
                <span className="font-mono text-accent font-semibold">{"{{" + v.key + "}}"}</span>
                <span className="text-text-dim text-[10px] truncate max-w-[100px] group-hover:text-text-base">
                  {v.value || <em>{strings.editor.emptyValue}</em>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
