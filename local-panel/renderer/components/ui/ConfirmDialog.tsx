import React, { useEffect, useRef } from "react";
import { strings } from "@/lib/strings";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title = "Confirm",
  message,
  confirmLabel = strings.common.delete,
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="bg-bg2 border border-border rounded-lg shadow-2xl p-4 w-72"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onConfirm(); } }}
      >
        {title && <p className="text-xs font-semibold text-text-bright mb-1">{title}</p>}
        <p className="text-xs text-text-base leading-relaxed mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded border border-border hover:bg-bg3 text-text-dim cursor-pointer"
            onClick={onCancel}
          >
            {strings.common.cancel}
          </button>
          <button
            ref={confirmRef}
            className="px-3 py-1.5 text-xs rounded font-semibold text-white cursor-pointer"
            style={{ background: confirmVariant === "danger" ? "var(--c-red)" : "var(--c-accent)" }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
