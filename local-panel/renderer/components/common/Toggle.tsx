import React from "react";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, disabled }: Props) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{ width: "2.25rem", height: "1.25rem", minWidth: "2.25rem" }}
      className={`relative rounded-full border transition-all flex-shrink-0 ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      } ${checked ? "bg-green/20 border-green" : "bg-bg3 border-border"}`}
    >
      <span
        style={{
          position: "absolute",
          top: "3px",
          left: checked ? "calc(100% - 15px)" : "3px",
          width: "14px",
          height: "14px",
          borderRadius: "50%",
          transition: "left 0.15s ease",
          background: checked ? "var(--c-green)" : "var(--c-text-dim)",
        }}
      />
    </button>
  );
}
