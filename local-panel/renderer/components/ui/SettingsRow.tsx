import React from "react";

interface SettingsRowProps {
  title: string;
  desc?: string;
  children: React.ReactNode;
}

export default function SettingsRow({ title, desc, children }: SettingsRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-base">{title}</div>
        {desc && <div className="text-xs text-text-dim mt-0.5">{desc}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
