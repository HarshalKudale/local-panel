import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "@/lib/icons";

interface NavSectionItem {
    id: string;
    label: string;
    icon: React.ReactNode;
}

interface Props {
    label: string;
    items: NavSectionItem[];
    activePanel: string;
    badges: Record<string, number | undefined>;
    onSelect: (id: string) => void;
    defaultCollapsed?: boolean;
    storageKey: string;
}

export default function NavSection({ label, items, activePanel, badges, onSelect, defaultCollapsed, storageKey }: Props) {
    const [collapsed, setCollapsed] = useState(() => {
        const stored = localStorage.getItem(`nav-section:${storageKey}`);
        if (stored !== null) return stored === "1";
        return defaultCollapsed ?? false;
    });

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem(`nav-section:${storageKey}`, next ? "1" : "0");
    };

    return (
        <div className="mt-1">
            <button
                onClick={toggle}
                className="flex items-center gap-1 px-2.5 pt-2.5 pb-1 w-full text-left cursor-pointer group"
            >
                <span className="w-3 flex items-center justify-center text-text-dim opacity-60 group-hover:opacity-100 transition-opacity">
                    {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-text-dim whitespace-nowrap">
                    {label}
                </span>
            </button>
            {!collapsed && (
                <div className="flex flex-col gap-0.5 pl-1">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onSelect(item.id)}
                            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm font-medium w-full text-left transition-all duration-150 cursor-pointer whitespace-nowrap ${activePanel === item.id
                                    ? "bg-bg3 text-accent"
                                    : "text-text-dim hover:bg-bg2 hover:text-text-base"
                                }`}
                        >
                            <span className="w-4 flex items-center justify-center flex-shrink-0">{item.icon}</span>
                            <span className="flex-1">{item.label}</span>
                            {badges[item.id] !== undefined && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold leading-none">
                                    {badges[item.id]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
