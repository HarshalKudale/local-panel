import React from "react";
import { Environment } from "@/types";
import { strings } from "@/lib/strings";
import { Globe, ChevronDown } from "@/lib/icons";

interface Props {
  environments: Environment[];
  activeId: string | null;
  open: boolean;
  dropdownRef: React.Ref<HTMLDivElement>;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onManage: () => void;
}

export default function EnvSelector({ environments, activeId, open, dropdownRef, onToggle, onClose, onSelect, onManage }: Props) {
  const active = environments.find((e) => e.id === activeId) ?? null;

  return (
    <div
      ref={dropdownRef}
      className="relative flex-shrink-0"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <button
        onClick={onToggle}
        title={strings.titleBar.switchEnvironment}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors cursor-pointer ${
          active
            ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
            : "border-border bg-bg2 text-text-dim hover:bg-bg3 hover:text-text-base"
        }`}
      >
        <Globe size={11} />
        <span className="max-w-[120px] truncate">{active ? active.name : strings.titleBar.noEnvironment}</span>
        <ChevronDown size={10} className="opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div className="absolute top-full mt-1 right-0 z-50 bg-bg2 border border-border rounded-md shadow-2xl py-1 min-w-[200px] animate-scale-in">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim border-b border-border/60">
              {strings.titleBar.environment}
            </div>
            <button
              onClick={() => onSelect(null)}
              className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-bg3 flex items-center gap-2 ${activeId === null ? "text-accent font-semibold" : "text-text-base"}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeId === null ? "bg-accent" : "bg-text-dim/30"}`} />
              {strings.titleBar.noEnv}
            </button>
            {environments.map((env) => (
              <button
                key={env.id}
                onClick={() => onSelect(env.id)}
                className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-bg3 flex items-center gap-2 ${activeId === env.id ? "text-accent font-semibold" : "text-text-base"}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeId === env.id ? "bg-accent" : "bg-text-dim/30"}`}
                  style={{ boxShadow: activeId === env.id ? "0 0 4px var(--c-accent)" : "none" }}
                />
                <span className="truncate">{env.name}</span>
                <span className="ml-auto text-[10px] text-text-dim font-mono">{env.variables.length}v</span>
              </button>
            ))}
            <div className="border-t border-border/60 mt-1 pt-1">
              <button
                onClick={onManage}
                className="w-full text-left px-3 py-1.5 text-xs text-text-dim hover:text-accent hover:bg-bg3 cursor-pointer transition-colors"
              >
                {strings.titleBar.manageEnvironments}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
