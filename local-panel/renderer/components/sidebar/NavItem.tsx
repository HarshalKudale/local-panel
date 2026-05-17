import React from "react";

interface Props {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  onClick: () => void;
}

export default function NavItem({ label, icon, active, badge, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm font-medium w-full text-left transition-all duration-150 cursor-pointer whitespace-nowrap ${
        active
          ? "bg-bg3 text-accent"
          : "text-text-dim hover:bg-bg2 hover:text-text-base"
      }`}
    >
      <span className="w-4 flex items-center justify-center flex-shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold leading-none">
          {badge}
        </span>
      )}
    </button>
  );
}
