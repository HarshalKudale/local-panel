import React from "react";
import PanelHeader from "@/components/layout/PanelHeader";

interface PanelLayoutProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
}

export default function PanelLayout({ title, subtitle, actions, children, noPadding }: PanelLayoutProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PanelHeader title={title} subtitle={subtitle} actions={actions} />
      <div className={`flex-1 overflow-y-auto ${noPadding ? "" : "p-6"}`}>
        {children}
      </div>
    </div>
  );
}
