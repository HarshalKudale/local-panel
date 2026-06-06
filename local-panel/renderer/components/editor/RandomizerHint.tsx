import React, { useState } from "react";
import { RANDOMIZER_TOKENS } from "@/lib/randomizer";
import { strings } from "@/lib/strings";

interface Props {
  onInsert: (token: string) => void;
}

/**
 * Button that opens a popover listing all {{random.*}} tokens.
 * Clicking a token calls onInsert("{{random.xxx}}").
 */
export default function RandomizerHint({ onInsert }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex-shrink-0" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        title={strings.editor.insertRandomToken}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-purple text-[10px] font-mono transition-colors cursor-pointer"
      >
        <span className="text-purple/70">{"{{"}</span>
        <span className="text-text-dim">random</span>
        <span className="text-purple/70">{"}}"}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 z-50 bg-bg2 border border-border rounded-md shadow-2xl py-1 min-w-[260px] max-h-72 overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim border-b border-border/60">
              {strings.editor.randomizerTokens}
            </div>
            {RANDOMIZER_TOKENS.map((t) => (
              <button
                key={t.key}
                onClick={() => { onInsert(`{{${t.key}}}`); setOpen(false); }}
                className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs cursor-pointer hover:bg-bg3 text-left group"
              >
                <span className="font-mono text-purple font-semibold shrink-0">{"{{" + t.key + "}}"}</span>
                <span className="text-text-dim text-[10px] truncate group-hover:text-text-base text-right">
                  {t.description}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
