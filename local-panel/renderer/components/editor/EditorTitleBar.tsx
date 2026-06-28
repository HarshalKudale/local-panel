import React from "react";
import { strings } from "@/lib/strings";
import { X } from "@/lib/icons";
import Toggle from "@/components/common/Toggle";

interface Props {
  label: string;
  namePlaceholder: string;
  name: string;
  onNameChange(v: string): void;
  onClose(): void;
  autoFocus?: boolean;
  enabled?: boolean;
  onToggleEnabled?: () => void;
}

export default function EditorTitleBar({ label, namePlaceholder, name, onNameChange, onClose, autoFocus, enabled, onToggleEnabled }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
      <span className="text-[10px] font-semibold text-text-dim uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      {onToggleEnabled !== undefined && enabled !== undefined && (
        <Toggle checked={enabled} onChange={onToggleEnabled} />
      )}
      <input
        className="flex-1 bg-bg2 border border-border focus:border-accent rounded px-3 py-1.5 text-sm text-text-bright outline-none placeholder:text-text-dim transition-colors"
        placeholder={namePlaceholder}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        autoFocus={autoFocus}
      />
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-text-base cursor-pointer text-xs font-medium transition-colors flex-shrink-0"
      >
        <X size={12} /> {strings.common.close}
      </button>
    </div>
  );
}
