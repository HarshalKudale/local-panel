import React from "react";
import { Panel, PanelEntry } from "@/lib/panelRegistry";
import NavItem from "@/components/sidebar/NavItem";
import NavSection from "@/components/sidebar/NavSection";

interface Props {
    entries: PanelEntry[];
    activePanel: Panel;
    onPanelSelect: (id: Panel) => void;
    badges: Partial<Record<Panel, number | undefined>>;
}

/**
 * Application sidebar that renders navigation entries grouped by section.
 * Only renders entries that are passed in (caller should pre-filter to enabled entries).
 * Flat sections render items directly; collapsible sections use NavSection.
 */
export default function AppSidebar({ entries, activePanel, onPanelSelect, badges }: Props) {
    // Group entries by section, preserving order of first appearance
    const sections: { label: string; type: "flat" | "collapsible"; items: PanelEntry[] }[] = [];
    const sectionMap = new Map<string, { label: string; type: "flat" | "collapsible"; items: PanelEntry[] }>();

    for (const entry of entries) {
        let sec = sectionMap.get(entry.section);
        if (!sec) {
            sec = { label: entry.section, type: entry.sectionType, items: [] };
            sectionMap.set(entry.section, sec);
            sections.push(sec);
        }
        sec.items.push(entry);
    }

    return (
        <div className="w-48 flex flex-col p-2 gap-0.5 overflow-y-auto overflow-x-hidden">
            {sections.map((section) => {
                if (section.type === "collapsible") {
                    return (
                        <NavSection
                            key={section.label}
                            label={section.label}
                            items={section.items.map((e) => ({ id: e.id, label: e.label, icon: e.icon }))}
                            activePanel={activePanel}
                            badges={badges as Record<string, number | undefined>}
                            onSelect={(id) => onPanelSelect(id as Panel)}
                            storageKey={section.label.toLowerCase()}
                        />
                    );
                }

                // Flat section
                return (
                    <React.Fragment key={section.label}>
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-text-dim px-2.5 pt-3 pb-1 whitespace-nowrap">
                            {section.label}
                        </div>
                        {section.items.map((n) => (
                            <NavItem
                                key={n.id}
                                id={n.id}
                                label={n.label}
                                icon={n.icon}
                                active={activePanel === n.id}
                                badge={badges[n.id]}
                                onClick={() => onPanelSelect(n.id)}
                            />
                        ))}
                    </React.Fragment>
                );
            })}
        </div>
    );
}
