import React, { useEffect } from "react";

export interface ContextMenuItem {
  label?: string;
  icon?: React.ReactNode;
  danger?: boolean;
  sep?: boolean;
  disabled?: boolean;
  action?(): void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose(): void;
  minWidth?: number;
}

export default function ContextMenu({ x, y, items, onClose, minWidth = 210 }: ContextMenuProps) {
  const totalH = items.reduce((s, i) => s + (i.sep ? 9 : 30), 0) + 8;
  const ax = Math.min(x, window.innerWidth - minWidth - 8);
  const ay = Math.min(y, window.innerHeight - totalH - 8);

  useEffect(() => {
    const h = (e: MouseEvent) => { e.stopPropagation(); onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("click", h);
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("click", h); window.removeEventListener("keydown", k); };
  }, [onClose]);

  return (
    <div
      className="fixed z-50 bg-bg2 border border-border rounded-md shadow-2xl py-1 select-none animate-scale-in"
      style={{ left: ax, top: ay, minWidth }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.sep ? (
          <div key={i} className="mx-2 my-1 border-t border-border/60" />
        ) : (
          <button
            key={i}
            onClick={item.disabled ? undefined : item.action}
            disabled={item.disabled}
            className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-2 ${
              item.disabled
                ? "opacity-40 cursor-not-allowed text-text-dim"
                : item.danger
                ? "text-red hover:bg-bg3 cursor-pointer"
                : "text-text-base hover:bg-bg3 cursor-pointer"
            }`}
          >
            {item.icon !== undefined && (
              <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 14 }}>
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
