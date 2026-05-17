import React from "react";
import { ChevronLeft, ChevronRight } from "@/lib/icons";

interface SidebarLayoutProps {
  sidebarOpen: boolean;
  onToggle: () => void;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  collapsedBadge?: React.ReactNode;
  collapseTitle?: string;
  expandTitle?: string;
  /** Fixed sidebar width in pixels (default 230) */
  sidebarWidth?: number;
}

export default function SidebarLayout({
  sidebarOpen,
  onToggle,
  sidebar,
  children,
  collapsedBadge,
  collapseTitle = "Collapse sidebar",
  expandTitle = "Expand sidebar",
  sidebarWidth = 230,
}: SidebarLayoutProps) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Expanded sidebar — animates width from 0 → sidebarWidth */}
      <div
        className="panel-sidebar flex flex-col bg-bg1 border-r border-border overflow-hidden flex-shrink-0"
        style={{ width: sidebarOpen ? sidebarWidth : 0, opacity: sidebarOpen ? 1 : 0 }}
      >
        {sidebar}
      </div>

      {/* Collapsed strip — animates width from 36 → 0 when open */}
      <div
        className="panel-sidebar flex flex-col items-center py-2 gap-2 border-r border-border bg-bg1 flex-shrink-0 overflow-hidden"
        style={{ width: sidebarOpen ? 0 : 36, opacity: sidebarOpen ? 0 : 1 }}
      >
        <button
          onClick={onToggle}
          title={expandTitle}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-bg2 text-text-dim hover:text-text-base transition-colors cursor-pointer"
        >
          <ChevronRight size={13} />
        </button>
        {collapsedBadge}
      </div>

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">{children}</div>
    </div>
  );
}

interface SidebarHeaderProps {
  children: React.ReactNode;
  onCollapse: () => void;
  collapseTitle?: string;
}

export function SidebarHeader({ children, onCollapse, collapseTitle = "Collapse sidebar" }: SidebarHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-2 border-b border-border flex-shrink-0">
      <div className="flex-1 min-w-0">{children}</div>
      <button
        onClick={onCollapse}
        title={collapseTitle}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-bg2 text-text-dim hover:text-text-base transition-colors flex-shrink-0 cursor-pointer"
      >
        <ChevronLeft size={13} />
      </button>
    </div>
  );
}
