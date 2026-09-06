import React from "react";
import { strings } from "@/lib/strings";
import { X } from "@/lib/icons";
import { Switch } from "@/components/ui";

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
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      {onToggleEnabled !== undefined && enabled !== undefined && (
        <Switch checked={enabled} onChange={onToggleEnabled} />
      )}
      <input
        className="flex-1 bg-card border border-border focus:border-signal rounded px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground transition-colors"
        placeholder={namePlaceholder}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        autoFocus={autoFocus}
      />
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-card hover:bg-surface-2 text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium transition-colors flex-shrink-0"
      >
        <X size={12} /> {strings.common.close}
      </button>
    </div>
  );
}
