import React from "react";

interface Props {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  collapsed?: boolean;
  onClick: () => void;
}

export default function NavItem({ id, label, icon, active, badge, collapsed, onClick }: Props) {
  // Support both ID and normalized label for data-testid
  const testId = `nav-${id ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  if (collapsed) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        title={label}
        className={`relative flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150 cursor-pointer ${
          active
            ? "bg-signal/15 text-signal border border-signal/35 shadow-[var(--glow-signal-sm)]"
            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground border border-transparent"
        }`}
      >
        <span
          className={`w-4 flex items-center justify-center flex-shrink-0 transition-colors ${
            active ? "text-signal" : "text-muted-foreground group-hover:text-foreground"
          }`}
        >
          {icon}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`group relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium w-full text-left transition-all duration-150 cursor-pointer whitespace-nowrap ${
        active
          ? "bg-signal/15 text-signal font-semibold border border-signal/35 shadow-[var(--glow-signal-sm)]"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground border border-transparent"
      }`}
    >
      <span
        className={`w-4 flex items-center justify-center flex-shrink-0 transition-colors ${
          active ? "text-signal" : "text-muted-foreground group-hover:text-foreground"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none transition-colors ${
            active
              ? "bg-signal/25 text-signal border border-signal/40"
              : "bg-surface-2 text-muted-foreground"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
