import React from "react";
import { strings } from "@/lib/strings";
import {
    Zap,
    ArrowLeftRight,
    Settings,
    Clipboard,
    ArrowUpRight,
    Radio,
    Globe,
    ClipboardList,
    Layers,
    Activity,
    Webhook,
    Network,
    FileCode,
    Braces,
    Play,
} from "@/lib/icons";

// ── Panel ID union type ─────────────────────────────────────────────────────

export type Panel =
    | "services"
    | "mappings"
    | "rules"
    | "capture"
    | "mock-rest"
    | "mock-graphql"
    | "mock-soap"
    | "mock-grpc"
    | "req-rest"
    | "req-graphql"
    | "req-soap"
    | "req-grpc"
    | "sockets"
    | "environments"
    | "settings"
    | "audit"
    | "workspace"
    | "healthbar"
    | "webhooks"
    | "applications";

// ── Panel entry definition ──────────────────────────────────────────────────

export interface PanelEntry {
    id: Panel;
    label: string;
    icon: React.ReactNode;
    section: string;
    sectionType: "flat" | "collapsible";
    enabled: boolean;
    /** When false, the panel is functional but hidden from the sidebar nav.
     *  Use the three-dot workspace menu to access workspace/audit panels. */
    showInSidebar?: boolean;
    helpText: string;
}

// ── Panel registry ──────────────────────────────────────────────────────────
// Toggle `enabled` to false to hide a panel from the sidebar and show a
// placeholder when navigated to directly. Useful for in-progress panels.

export const PANEL_REGISTRY: PanelEntry[] = [
    // ─── Routing (flat) ───────────────────────────────────────────────────────
    {
        id: "mappings",
        label: strings.nav.mappings,
        icon: <ArrowLeftRight size={14} />,
        section: strings.nav.routing,
        sectionType: "flat",
        enabled: true,
        helpText: strings.mappings.helpText,
    },
    {
        id: "rules",
        label: strings.nav.proxyRules,
        icon: <Settings size={14} />,
        section: strings.nav.routing,
        sectionType: "flat",
        enabled: true,
        helpText: strings.proxyRules.helpText,
    },
    {
        id: "capture",
        label: strings.nav.capture,
        icon: <Clipboard size={14} />,
        section: strings.nav.routing,
        sectionType: "flat",
        enabled: true,
        helpText: strings.capture.helpText,
    },

    // ─── Mock (collapsible) ───────────────────────────────────────────────────
    {
        id: "mock-rest",
        label: "REST",
        icon: <ArrowUpRight size={14} />,
        section: "Mock",
        sectionType: "collapsible",
        enabled: true,
        helpText: strings.mocks.helpText,
    },
    {
        id: "mock-graphql",
        label: "GraphQL",
        icon: <Braces size={14} />,
        section: "Mock",
        sectionType: "collapsible",
        enabled: true,
        helpText: "Create GraphQL mock operations. Match incoming queries and mutations by operation name and return configured responses.",
    },
    {
        id: "mock-soap",
        label: "SOAP",
        icon: <FileCode size={14} />,
        section: "Mock",
        sectionType: "collapsible",
        enabled: true,
        helpText: "Create SOAP mock services. Match incoming requests by SOAPAction header and return configured XML responses.",
    },
    {
        id: "mock-grpc",
        label: "gRPC",
        icon: <Network size={14} />,
        section: "Mock",
        sectionType: "collapsible",
        enabled: true,
        helpText: "Create gRPC mock services. Run a local gRPC server that returns configured responses for matched methods.",
    },

    // ─── Request (collapsible) ────────────────────────────────────────────────
    {
        id: "req-rest",
        label: "REST",
        icon: <ArrowUpRight size={14} />,
        section: "Request",
        sectionType: "collapsible",
        enabled: true,
        helpText: strings.requests.helpText,
    },
    {
        id: "req-graphql",
        label: "GraphQL",
        icon: <Braces size={14} />,
        section: "Request",
        sectionType: "collapsible",
        enabled: true,
        helpText: "Send GraphQL queries and mutations. Import schemas via introspection or SDL files for query generation.",
    },
    {
        id: "req-soap",
        label: "SOAP",
        icon: <FileCode size={14} />,
        section: "Request",
        sectionType: "collapsible",
        enabled: true,
        helpText: "Send SOAP requests. Import WSDL files to discover operations and auto-generate request envelopes.",
    },
    {
        id: "req-grpc",
        label: "gRPC",
        icon: <Network size={14} />,
        section: "Request",
        sectionType: "collapsible",
        enabled: true,
        helpText: "Make gRPC calls. Import .proto files or use server reflection to discover services and methods.",
    },
    {
        id: "sockets",
        label: "WebSocket",
        icon: <Radio size={14} />,
        section: "Request",
        sectionType: "collapsible",
        enabled: true,
        helpText: strings.sockets.helpText,
    },
    {
        id: "webhooks",
        label: "Webhooks",
        icon: <Webhook size={14} />,
        section: "Request",
        sectionType: "collapsible",
        enabled: true,
        helpText: "Create and manage webhooks. Open a webhook in a tab to activate it and receive POST requests on the webhook server.",
    },

    // ─── Tools (flat) ─────────────────────────────────────────────────────────
    {
        id: "environments",
        label: strings.nav.environments,
        icon: <Globe size={14} />,
        section: strings.nav.tools,
        sectionType: "flat",
        enabled: true,
        helpText: strings.environments.helpText,
    },

    // ─── Applications (flat) ──────────────────────────────────────────────────
    {
        id: "applications",
        label: "Run Configs",
        icon: <Play size={14} />,
        section: "Applications",
        sectionType: "flat",
        enabled: true,
        helpText: strings.applications.helpText,
    },

    // ─── Discovery (flat) ─────────────────────────────────────────────────────
    {
        id: "services",
        label: strings.nav.services,
        icon: <Zap size={14} />,
        section: strings.nav.discovery,
        sectionType: "flat",
        enabled: true,
        helpText: strings.services.helpText,
    },

    // ─── Monitoring (flat) ────────────────────────────────────────────────────
    {
        id: "healthbar",
        label: "Health Bar",
        icon: <Activity size={14} />,
        section: "Monitoring",
        sectionType: "flat",
        enabled: true,
        helpText: "Monitor health check endpoints for your services. Responses are fetched live from the main process.",
    },

    // ─── Config (flat) ────────────────────────────────────────────────────────
    {
        id: "workspace",
        label: "Workspace",
        icon: <Layers size={14} />,
        section: strings.nav.config,
        sectionType: "flat",
        enabled: true,
        showInSidebar: false,   // accessed via the sticky workspace footer three-dot menu
        helpText: strings.workspace.helpText,
    },
    {
        id: "audit",
        label: "Audit Log",
        icon: <ClipboardList size={14} />,
        section: strings.nav.config,
        sectionType: "flat",
        enabled: true,
        showInSidebar: false,   // accessed via the sticky workspace footer three-dot menu
        helpText: "A complete history of every configuration change in this workspace.",
    },
    {
        id: "settings",
        label: strings.nav.settings,
        icon: <Settings size={14} />,
        section: strings.nav.config,
        sectionType: "flat",
        enabled: true,
        helpText: strings.settings.helpText,
    },
];

// ── Derived helpers ─────────────────────────────────────────────────────────

/** Panel entries that are both enabled and visible in the sidebar nav.
 *  Panels with showInSidebar: false (workspace, audit) are still functional
 *  but accessed via the sticky workspace footer menu instead. */
export const enabledPanels = PANEL_REGISTRY.filter((e) => e.enabled && e.showInSidebar !== false);

/** Quick lookup: is a given panel enabled? */
export function isPanelEnabled(id: Panel): boolean {
    const entry = PANEL_REGISTRY.find((e) => e.id === id);
    return entry?.enabled ?? false;
}

/** Help text keyed by panel ID (only enabled panels) */
export const PANEL_HELP: Record<Panel, string> = Object.fromEntries(
    PANEL_REGISTRY.map((e) => [e.id, e.helpText])
) as Record<Panel, string>;
