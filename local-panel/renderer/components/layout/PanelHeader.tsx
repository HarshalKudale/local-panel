import React from "react";

interface PanelHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PanelHeader({ title, subtitle, actions }: PanelHeaderProps) {
  return (
    <div className="px-6 py-4 border-b border-border flex items-center gap-3 flex-shrink-0">
      <div>
        <h1 className="text-base font-semibold text-text-bright">{title}</h1>
        {subtitle && <p className="text-xs text-text-dim mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
