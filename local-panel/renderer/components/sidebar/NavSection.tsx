import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "@/lib/icons";
import { readStorageRaw, writeStorageRaw } from "@/lib/storage";
import NavItem from "@/components/sidebar/NavItem";

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
    const sectionTestId = `nav-section-${storageKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

    const [collapsed, setCollapsed] = useState(() => {
        const stored = readStorageRaw(`nav-section:${storageKey}`);
        if (stored !== null) return stored === "1";
        return defaultCollapsed ?? false;
    });

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        writeStorageRaw(`nav-section:${storageKey}`, next ? "1" : "0");
    };

    return (
        <div className="mt-1">
            <button
                type="button"
                data-testid={sectionTestId}
                onClick={toggle}
                className="flex items-center gap-1 px-2.5 pt-2.5 pb-1 w-full text-left cursor-pointer group"
            >
                <span className="w-3 flex items-center justify-center text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">
                    {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                    {label}
                </span>
            </button>
            {!collapsed && (
                <div className="flex flex-col gap-0.5 pl-1">
                    {items.map((item) => (
                        <NavItem
                            key={item.id}
                            id={item.id}
                            label={item.label}
                            icon={item.icon}
                            active={activePanel === item.id}
                            badge={badges[item.id]}
                            onClick={() => onSelect(item.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
