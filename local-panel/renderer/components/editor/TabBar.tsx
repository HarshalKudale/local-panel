import React, { useRef, useState, useEffect, useCallback } from "react";
import { Plus, ChevronLeft, ChevronRight, X } from "@/lib/icons";

export interface TabBarTab {
  id: string;
  label: string;
  isDraft?: boolean;
  /** Optional custom renderer for the tab pill content. Receives active state. */
  renderTab?: (isActive: boolean) => React.ReactNode;
}

interface Props {
  tabs: TabBarTab[];
  activeTab: string | null;
  onTabClick(id: string): void;
  onTabClose(id: string): void;
  onNewTab(): void;
  newTabTitle?: string;
  closeTabTitle?: string;
}

export default function TabBar({ tabs, activeTab, onTabClick, onTabClose, onNewTab, newTabTitle = "New tab", closeTabTitle = "Close tab" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    el.addEventListener("scroll", sync, { passive: true });
    sync();
    return () => { ro.disconnect(); el.removeEventListener("scroll", sync); };
  }, [sync]);

  // Re-check whenever tab list changes
  useEffect(sync, [tabs, sync]);

  return (
    <div className="flex items-stretch border-b border-border bg-bg1 flex-shrink-0 min-h-[34px]">
      {/* Sticky add button */}
      <button
        onClick={onNewTab}
        title={newTabTitle}
        className="flex items-center justify-center w-8 flex-shrink-0 border-r border-border text-text-dim hover:text-accent hover:bg-bg2 transition-colors cursor-pointer"
      >
        <Plus size={14} />
      </button>

      {/* Left chevron */}
      {canLeft && (
        <button
          className="flex items-center justify-center w-6 flex-shrink-0 border-r border-border text-text-dim hover:text-text-base hover:bg-bg2 transition-colors cursor-pointer"
          onClick={() => scrollRef.current?.scrollBy({ left: -120, behavior: "smooth" })}
        >
          <ChevronLeft size={12} />
        </button>
      )}

      {/* Scrollable tabs — no scrollbar */}
      <div
        ref={scrollRef}
        className="tab-bar-scroll flex items-end flex-1 overflow-x-auto min-w-0"
        onWheel={(e) => {
          const el = scrollRef.current;
          if (!el) return;
          e.preventDefault();
          el.scrollBy({ left: e.deltaY !== 0 ? e.deltaY : e.deltaX, behavior: "smooth" });
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const baseClass = `flex items-center gap-1 px-3 py-2 text-xs font-medium cursor-pointer border-r border-border whitespace-nowrap flex-shrink-0 transition-colors ${
            isActive ? "bg-bg0 text-text-bright border-b-2 border-b-accent -mb-px" : "text-text-dim hover:bg-bg2 hover:text-text-base"
          }`;
          if (tab.renderTab) {
            return (
              <div key={tab.id} className={baseClass} onClick={() => onTabClick(tab.id)}>
                {tab.renderTab(isActive)}
              </div>
            );
          }
          return (
            <div key={tab.id} className={baseClass} onClick={() => onTabClick(tab.id)}>
              {tab.isDraft && <span className="text-[8px] text-yellow opacity-70 flex-shrink-0">●</span>}
              <span className="max-w-[160px] truncate">{tab.label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                className="w-4 h-4 flex items-center justify-center rounded hover:bg-bg3 text-text-dim hover:text-text-base transition-colors ml-0.5 flex-shrink-0 cursor-pointer"
                title={closeTabTitle}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right chevron */}
      {canRight && (
        <button
          className="flex items-center justify-center w-6 flex-shrink-0 border-l border-border text-text-dim hover:text-text-base hover:bg-bg2 transition-colors cursor-pointer"
          onClick={() => scrollRef.current?.scrollBy({ left: 120, behavior: "smooth" })}
        >
          <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}
