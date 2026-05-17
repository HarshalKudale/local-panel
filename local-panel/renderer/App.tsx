import React, { useEffect, useState, useCallback, useMemo } from "react";
import { AppConfig, MockRule, SavedRequest, ServiceInfo, Folder, SyncStatus } from "@/types";
import { entityRelPath, flatEntityRelPath } from "@/lib/utils";

import ServicesPanel from "@/panels/ServicesPanel";
import MappingsPanel from "@/panels/MappingsPanel";
import ProxyRulesPanel from "@/panels/ProxyRulesPanel";
import SettingsPanel from "@/panels/SettingsPanel";
import CapturePanel, { CaptureStats } from "@/panels/CapturePanel";
import MocksPanel from "@/panels/MocksPanel";
import RequestsPanel from "@/panels/RequestsPanel";
import WebSocketsPanel from "@/panels/WebSocketsPanel";
import WebhooksPanel from "@/panels/WebhooksPanel";
import EnvironmentsPanel from "@/panels/EnvironmentsPanel";
import AuditLogPanel from "@/panels/AuditLogPanel";
import WorkspacePanel from "@/panels/WorkspacePanel";
import HealthBarPanel from "@/panels/HealthBarPanel";

import HistorySidebar from "@/components/sidebar/HistorySidebar";
import NavItem from "@/components/sidebar/NavItem";
import NavSection from "@/components/sidebar/NavSection";
import TitleBar from "@/components/layout/TitleBar";
import GlobalFooter from "@/components/layout/GlobalFooter";
import PlaceholderPanel from "@/panels/PlaceholderPanel";
import GraphQLRequestsPanel from "@/panels/GraphQLRequestsPanel";
import GraphQLMocksPanel from "@/panels/GraphQLMocksPanel";
import GrpcRequestsPanel from "@/panels/GrpcRequestsPanel";
import GrpcMocksPanel from "@/panels/GrpcMocksPanel";
import SoapRequestsPanel from "@/panels/SoapRequestsPanel";
import SoapMocksPanel from "@/panels/SoapMocksPanel";
import { strings } from "@/lib/strings";
import { useTheme } from "@/lib/useTheme";
import { Zap, ArrowLeftRight, Settings, Clipboard, ArrowUpRight, Radio, Globe, ClipboardList, History, Layers, Activity, Webhook, Network, FileCode, Braces } from "@/lib/icons";

type Panel = "services" | "mappings" | "rules" | "capture" | "mock-rest" | "mock-graphql" | "mock-soap" | "mock-grpc" | "req-rest" | "req-graphql" | "req-soap" | "req-grpc" | "sockets" | "environments" | "settings" | "audit" | "workspace" | "healthbar" | "webhooks";

const PANEL_HELP: Record<Panel, string> = {
  services: strings.services.helpText,
  mappings: strings.mappings.helpText,
  rules: strings.proxyRules.helpText,
  capture: strings.capture.helpText,
  "mock-rest": strings.mocks.helpText,
  "mock-graphql": "Create GraphQL mock operations. Match incoming queries and mutations by operation name and return configured responses.",
  "mock-soap": "Create SOAP mock services. Match incoming requests by SOAPAction header and return configured XML responses.",
  "mock-grpc": "Create gRPC mock services. Run a local gRPC server that returns configured responses for matched methods.",
  "req-rest": strings.requests.helpText,
  "req-graphql": "Send GraphQL queries and mutations. Import schemas via introspection or SDL files for query generation.",
  "req-soap": "Send SOAP requests. Import WSDL files to discover operations and auto-generate request envelopes.",
  "req-grpc": "Make gRPC calls. Import .proto files or use server reflection to discover services and methods.",
  sockets: strings.sockets.helpText,
  environments: strings.environments.helpText,
  settings: strings.settings.helpText,
  audit: "A complete history of every configuration change in this workspace.",
  workspace: strings.workspace.helpText,
  healthbar: "Monitor health check endpoints for your services. Responses are fetched live from the main process.",
  webhooks: "Create and manage webhooks. Open a webhook in a tab to activate it and receive POST requests on the webhook server.",
};

const NAV_FLAT_SECTIONS = [
  {
    label: strings.nav.routing,
    items: [
      { id: "mappings" as Panel, label: strings.nav.mappings, icon: <ArrowLeftRight size={14} /> },
      { id: "rules" as Panel, label: strings.nav.proxyRules, icon: <Settings size={14} /> },
      { id: "capture" as Panel, label: strings.nav.capture, icon: <Clipboard size={14} /> },
    ],
  },
];

const NAV_MOCK_ITEMS = [
  { id: "mock-rest" as Panel, label: "REST", icon: <ArrowUpRight size={14} /> },
  { id: "mock-graphql" as Panel, label: "GraphQL", icon: <Braces size={14} /> },
  { id: "mock-soap" as Panel, label: "SOAP", icon: <FileCode size={14} /> },
  { id: "mock-grpc" as Panel, label: "gRPC", icon: <Network size={14} /> },
];

const NAV_REQUEST_ITEMS = [
  { id: "req-rest" as Panel, label: "REST", icon: <ArrowUpRight size={14} /> },
  { id: "req-graphql" as Panel, label: "GraphQL", icon: <Braces size={14} /> },
  { id: "req-soap" as Panel, label: "SOAP", icon: <FileCode size={14} /> },
  { id: "req-grpc" as Panel, label: "gRPC", icon: <Network size={14} /> },
  { id: "sockets" as Panel, label: "WebSocket", icon: <Radio size={14} /> },
  { id: "webhooks" as Panel, label: "Webhooks", icon: <Webhook size={14} /> },
];

const NAV_BOTTOM_SECTIONS = [
  {
    label: strings.nav.tools,
    items: [
      { id: "environments" as Panel, label: strings.nav.environments, icon: <Globe size={14} /> },
    ],
  },
  {
    label: strings.nav.discovery,
    items: [{ id: "services" as Panel, label: strings.nav.services, icon: <Zap size={14} /> }],
  },
  {
    label: "Monitoring",
    items: [
      { id: "healthbar" as Panel, label: "Health Bar", icon: <Activity size={14} /> },
    ],
  },
  {
    label: strings.nav.config,
    items: [
      { id: "workspace" as Panel, label: "Workspace", icon: <Layers size={14} /> },
      { id: "audit" as Panel, label: "Audit Log", icon: <ClipboardList size={14} /> },
      { id: "settings" as Panel, label: strings.nav.settings, icon: <Settings size={14} /> },
    ],
  },
];

const EMPTY_CONFIG: AppConfig = {
  port: 80,
  companionPort: 9100,
  minimizeToTray: true,
  tlsEnabled: false,
  tlsCaCertPath: null,
  tlsCaKeyPath: null,
  workspaces: [],
  activeWorkspaceId: "default",
  mappings: [],
  proxyRules: [],
  ruleFolders: [],
  mocks: [],
  requests: [],
  mockFolders: [],
  requestFolders: [],
  wsConnections: [],
  wsFolders: [],
  webhooks: [],
  webhookFolders: [],
  graphqlRequests: [],
  graphqlMocks: [],
  graphqlSchemas: [],
  graphqlRequestFolders: [],
  graphqlMockFolders: [],
  grpcRequests: [],
  grpcMocks: [],
  protoFiles: [],
  grpcRequestFolders: [],
  grpcMockFolders: [],
  grpcMockServerPort: 9102,
  soapRequests: [],
  soapMocks: [],
  savedWsdls: [],
  soapRequestFolders: [],
  soapMockFolders: [],
  webhookPort: 9101,
  environments: [],
  activeEnvironmentId: null,
};

export default function App() {
  const [theme, setTheme] = useTheme();
  const [panel, setPanel] = useState<Panel>("services");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [wsLoading, setWsLoading] = useState<string | null>("Loading workspace…");
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [mappingPrefill, setMappingPrefill] = useState<string | undefined>();
  const [pendingOpenRequest, setPendingOpenRequest] = useState<Omit<SavedRequest, "id" | "createdAt" | "workspaceId"> | null>(null);
  const [pendingMockInitial, setPendingMockInitial] = useState<Partial<MockRule> | null>(null);



  // Per-entity sync status (clean/modified/new/deleted)
  const [entitySyncStatus, setEntitySyncStatus] = useState<Record<string, "clean" | "modified" | "new" | "deleted">>({});

  // Global sync operation status (idle/pulling/pushing/cloning/error)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  // Capture panel stats — lifted so the global footer can display them
  const [captureStats, setCaptureStats] = useState<CaptureStats | null>(null);

  // History sidebar state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openedEntityPath, setOpenedEntityPath] = useState<string>("");
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  // Remember whether the left sidebar was open when history was opened
  const [sidebarWasOpen, setSidebarWasOpen] = useState(false);

  const openHistory = useCallback((filePath: string) => {
    // Toggle: if already open for same path, close it
    if (historyOpen && openedEntityPath === filePath) {
      setHistoryOpen(false);
      if (sidebarWasOpen) setSidebarOpen(true);
      return;
    }
    setOpenedEntityPath(filePath);
    if (!historyOpen) {
      setSidebarWasOpen(sidebarOpen);
      setSidebarOpen(false);
      setHistoryOpen(true);
    }
  }, [historyOpen, openedEntityPath, sidebarOpen, sidebarWasOpen]);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    if (sidebarWasOpen) setSidebarOpen(true);
  }, [sidebarWasOpen]);

  // After any save, bump the reload key so the history sidebar refreshes
  const bumpHistoryReload = useCallback(() => {
    setHistoryReloadKey((k) => k + 1);
  }, []);

  // When the opened entity path changes while history is open, just update the path (sidebar reloads itself)
  const handleEntityPathChange = useCallback((filePath: string) => {
    setOpenedEntityPath(filePath);
  }, []);

  // Derive workspace-scoped view from full config
  const wsId = config.activeWorkspaceId;
  const wsConfig = useMemo<AppConfig>(() => ({
    ...config,
    mappings: (config.mappings ?? []).filter((m) => m.workspaceId === wsId),
    proxyRules: (config.proxyRules ?? []).filter((r) => r.workspaceId === wsId),
    ruleFolders: (config.ruleFolders ?? []).filter((f) => f.workspaceId === wsId),
    mocks: (config.mocks ?? []).filter((m) => m.workspaceId === wsId),
    requests: (config.requests ?? []).filter((r) => r.workspaceId === wsId),
    mockFolders: (config.mockFolders ?? []).filter((f) => f.workspaceId === wsId),
    requestFolders: (config.requestFolders ?? []).filter((f) => f.workspaceId === wsId),
    wsConnections: (config.wsConnections ?? []).filter((c) => c.workspaceId === wsId),
    wsFolders: (config.wsFolders ?? []).filter((f) => f.workspaceId === wsId),
    webhooks: (config.webhooks ?? []).filter((h) => h.workspaceId === wsId),
    webhookFolders: (config.webhookFolders ?? []).filter((f) => f.workspaceId === wsId),
    graphqlRequests: (config.graphqlRequests ?? []).filter((r) => r.workspaceId === wsId),
    graphqlMocks: (config.graphqlMocks ?? []).filter((m) => m.workspaceId === wsId),
    graphqlSchemas: (config.graphqlSchemas ?? []),
    graphqlRequestFolders: (config.graphqlRequestFolders ?? []).filter((f) => f.workspaceId === wsId),
    graphqlMockFolders: (config.graphqlMockFolders ?? []).filter((f) => f.workspaceId === wsId),
    grpcRequests: (config.grpcRequests ?? []).filter((r) => r.workspaceId === wsId),
    grpcMocks: (config.grpcMocks ?? []).filter((m) => m.workspaceId === wsId),
    protoFiles: (config.protoFiles ?? []),
    grpcRequestFolders: (config.grpcRequestFolders ?? []).filter((f) => f.workspaceId === wsId),
    grpcMockFolders: (config.grpcMockFolders ?? []).filter((f) => f.workspaceId === wsId),
    soapRequests: (config.soapRequests ?? []).filter((r) => r.workspaceId === wsId),
    soapMocks: (config.soapMocks ?? []).filter((m) => m.workspaceId === wsId),
    savedWsdls: (config.savedWsdls ?? []),
    soapRequestFolders: (config.soapRequestFolders ?? []).filter((f) => f.workspaceId === wsId),
    soapMockFolders: (config.soapMockFolders ?? []).filter((f) => f.workspaceId === wsId),
    environments: (config.environments ?? []).filter((e) => e.workspaceId === wsId),
  }), [config, wsId]);

  const loadConfig = useCallback(async (loadingMsg = "Loading workspace…") => {
    setWsLoading(loadingMsg);
    try {
      const cfg = await window.api.getConfig();
      console.log(cfg);
      setConfig(cfg);
      const status = await window.api.serverStatus();
      setServerRunning(status.running);
      setServerError(status.error);
    } finally {
      setWsLoading(null);
    }
  }, []);

  const refreshServices = useCallback(async () => {
    const svcs = await window.api.discoverServices();
    setServices(svcs);
  }, []);

  const refreshEntitySyncStatus = useCallback((wsId: string) => {
    window.api.getEntitySyncStatus(wsId).then((status) => {
      console.log("[syncStatus] pathStatusMap keys:", Object.keys(status));
      setEntitySyncStatus(status);
    }).catch(() => { });
  }, []);



  useEffect(() => {
    loadConfig().then(() => {
      // Fetch sync status after initial load
      window.api.getConfig().then((cfg) => refreshEntitySyncStatus(cfg.activeWorkspaceId)).catch(() => { });
    });
    refreshServices();
    const unsubError = window.api.onServerError((err) => {
      setServerError(err);
      setServerRunning(false);
    });
    // Track overall sync operation state for the global footer
    // and refresh config once a pull/push completes
    const unsubSync = window.api.onSyncStatus((evt) => {
      setSyncStatus(evt.status as SyncStatus);
      if (evt.status === "idle") {
        window.api.getConfig().then((fresh) => {
          setConfig(fresh);
          refreshEntitySyncStatus(fresh.activeWorkspaceId);
        }).catch(() => { });
      }
    });
    // Subscribe to live entity status updates (after publish or pull)
    const unsubEntityStatus = window.api.onEntitySyncStatus((data) => {
      setEntitySyncStatus(data.status as Record<string, "clean" | "modified" | "new" | "deleted">);
    });
    // Refresh config when companion extension adds entities
    const unsubCompanion = window.api.onCompanionRefresh(() => {
      window.api.getConfig().then((fresh) => {
        setConfig(fresh);
        refreshEntitySyncStatus(fresh.activeWorkspaceId);
      }).catch(() => { });
    });
    return () => { unsubError(); unsubSync(); unsubEntityStatus(); unsubCompanion(); };
  }, [loadConfig, refreshServices, refreshEntitySyncStatus]);

  const handleConfigChange = useCallback(async (next: AppConfig) => {
    setConfig(next);
    await window.api.saveConfig(next);
    setServerRunning(true);
    setServerError(null);
    // Refresh entity sync status after any config change (debounce handled by git status call)
    refreshEntitySyncStatus(next.activeWorkspaceId);
  }, [refreshEntitySyncStatus]);

  // Panels pass back wsConfig mutations — we need to merge them back into full config
  const handleWsConfigChange = useCallback(async (next: AppConfig) => {
    const hasCrossWs = (
      (next.mappings ?? []).some((m) => m.workspaceId !== wsId) ||
      (next.mocks ?? []).some((m) => m.workspaceId !== wsId) ||
      (next.requests ?? []).some((r) => r.workspaceId !== wsId)
    );
    if (hasCrossWs) {
      await handleConfigChange(next);
      return;
    }
    const merged: AppConfig = {
      ...next,
      mappings: [...(config.mappings ?? []).filter((m) => m.workspaceId !== wsId), ...(next.mappings ?? [])],
      proxyRules: [...(config.proxyRules ?? []).filter((r) => r.workspaceId !== wsId), ...(next.proxyRules ?? [])],
      ruleFolders: [...(config.ruleFolders ?? []).filter((f) => f.workspaceId !== wsId), ...(next.ruleFolders ?? [])],
      mocks: [...(config.mocks ?? []).filter((m) => m.workspaceId !== wsId), ...(next.mocks ?? [])],
      requests: [...(config.requests ?? []).filter((r) => r.workspaceId !== wsId), ...(next.requests ?? [])],
      mockFolders: [...(config.mockFolders ?? []).filter((f) => f.workspaceId !== wsId), ...(next.mockFolders ?? [])],
      requestFolders: [...(config.requestFolders ?? []).filter((f) => f.workspaceId !== wsId), ...(next.requestFolders ?? [])],
      wsConnections: [...(config.wsConnections ?? []).filter((c) => c.workspaceId !== wsId), ...(next.wsConnections ?? [])],
      wsFolders: [...(config.wsFolders ?? []).filter((f) => f.workspaceId !== wsId), ...(next.wsFolders ?? [])],
      webhooks: [...(config.webhooks ?? []).filter((h) => h.workspaceId !== wsId), ...(next.webhooks ?? [])],
      webhookFolders: [...(config.webhookFolders ?? []).filter((f) => f.workspaceId !== wsId), ...(next.webhookFolders ?? [])],
      environments: [...(config.environments ?? []).filter((e) => e.workspaceId !== wsId), ...(next.environments ?? [])],
    };
    await handleConfigChange(merged);
  }, [config, wsId, handleConfigChange]);

  const clearWorkspaceContext = useCallback((loadingMsg = "Switching workspace…") => {
    setPendingOpenRequest(null);
    setPendingMockInitial(null);
    setHistoryOpen(false);
    setSidebarOpen(true);
    setMappingPrefill(undefined);
    setConfig(EMPTY_CONFIG);
    setWsLoading(loadingMsg);
  }, []);

  const handleOpenInRequests = useCallback((req: Omit<SavedRequest, "id" | "createdAt" | "workspaceId">) => {
    setPendingOpenRequest(req);
    setPanel("req-rest");
  }, []);

  const handleOpenMockEditor = useCallback((initial: Partial<MockRule>) => {
    setPendingMockInitial(initial);
    setPanel("mock-rest");
  }, []);

  // ── Publish helpers ────────────────────────────────────────────────────────

  const refreshConfig = useCallback(async () => {
    const cfg = await window.api.getConfig();
    setConfig(cfg);
  }, []);

  const makePublishItem = useCallback((kind: "requests" | "mocks" | "sockets" | "webhooks" | "rules", folders: Folder[]) =>
    async (id: string) => {
      const item = kind === "rules"
        ? (wsConfig.proxyRules ?? []).find((r) => r.id === id)
        : kind === "requests"
          ? (wsConfig.requests ?? []).find((r) => r.id === id)
          : kind === "mocks"
            ? (wsConfig.mocks ?? []).find((m) => m.id === id)
            : kind === "webhooks"
              ? (wsConfig.webhooks ?? []).find((h) => h.id === id)
              : (wsConfig.wsConnections ?? []).find((c) => c.id === id);
      if (!item) return;
      const relPath = entityRelPath(kind, item as any, folders);
      await window.api.publishEntity(wsId, [relPath]);
      await refreshConfig();
      refreshEntitySyncStatus(wsId);
    },
    [wsConfig, wsId, refreshEntitySyncStatus, refreshConfig]);

  const makePublishFolder = useCallback((kind: "requests" | "mocks" | "sockets" | "webhooks" | "rules", folders: Folder[]) =>
    async (folderId: string | null) => {
      await window.api.publishFolder(wsId, kind, folderId ? folders.find((f) => f.id === folderId)?.name ?? null : null);
      await refreshConfig();
      refreshEntitySyncStatus(wsId);
    },
    [wsId, refreshEntitySyncStatus, refreshConfig]);

  const makeFlatPublish = useCallback((kind: "mappings") =>
    async (id: string) => {
      const relPath = flatEntityRelPath(kind, id);
      await window.api.publishEntity(wsId, [relPath]);
      refreshEntitySyncStatus(wsId);
    },
    [wsId, refreshEntitySyncStatus]);

  const makeFlatRevert = useCallback((kind: "mappings") =>
    async (id: string) => {
      const relPath = flatEntityRelPath(kind, id);
      await window.api.restoreEntity(wsId, relPath);
      await refreshConfig();
      refreshEntitySyncStatus(wsId);
    },
    [wsId, refreshEntitySyncStatus, refreshConfig]);

  const handlePublishHealthBar = useCallback(async () => {
    await window.api.publishEntity(wsId, ["healthbar/services.json"]);
    refreshEntitySyncStatus(wsId);
  }, [wsId, refreshEntitySyncStatus]);

  // ── Global footer publish ──────────────────────────────────────────────────

  // Map from panel name to the git folder kind used for a bulk publish
  const PANEL_PUBLISH_KIND: Partial<Record<Panel, string>> = {
    "mock-rest": "mocks",
    "req-rest": "requests",
    sockets: "sockets",
    webhooks: "webhooks",
    mappings: "mappings",
    rules: "rules",
    environments: "environments",
    healthbar: "healthbar",
  };

  const handlePublishPanel = useCallback(async () => {
    const kind = PANEL_PUBLISH_KIND[panel];
    if (!kind) return;
    if (kind === "healthbar") {
      await window.api.publishEntity(wsId, ["healthbar/services.json"]);
    } else {
      await window.api.publishFolder(wsId, kind, null);
    }
    await refreshConfig();
    refreshEntitySyncStatus(wsId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, wsId, refreshConfig, refreshEntitySyncStatus]);

  const makeRestoreItem = useCallback((kind: "requests" | "mocks" | "sockets" | "webhooks" | "rules", folders: Folder[]) =>
    async (id: string) => {
      const item = kind === "rules"
        ? (wsConfig.proxyRules ?? []).find((r) => r.id === id)
        : kind === "requests"
          ? (wsConfig.requests ?? []).find((r) => r.id === id)
          : kind === "mocks"
            ? (wsConfig.mocks ?? []).find((m) => m.id === id)
            : kind === "webhooks"
              ? (wsConfig.webhooks ?? []).find((h) => h.id === id)
              : (wsConfig.wsConnections ?? []).find((c) => c.id === id);
      if (!item) return;
      const relPath = entityRelPath(kind, item as any, folders);
      await window.api.restoreEntity(wsId, relPath);
      await refreshConfig();
      refreshEntitySyncStatus(wsId);
    },
    [wsConfig, wsId, refreshEntitySyncStatus, refreshConfig]);

  const activeEnv = (wsConfig.environments ?? []).find((e) => e.id === wsConfig.activeEnvironmentId) ?? null;

  const cnt = (n: number) => n > 0 ? n : undefined;
  const navBadges: Partial<Record<Panel, number | undefined>> = {
    mappings: cnt((wsConfig.mappings ?? []).length),
    rules: cnt((wsConfig.proxyRules ?? []).length),
    "mock-rest": cnt((wsConfig.mocks ?? []).length),
    "req-rest": cnt((wsConfig.requests ?? []).length),
    "req-soap": cnt((wsConfig.soapRequests ?? []).length),
    "mock-soap": cnt((wsConfig.soapMocks ?? []).length),
    sockets: cnt((wsConfig.wsConnections ?? []).length),
    webhooks: cnt((wsConfig.webhooks ?? []).length),
    environments: cnt((wsConfig.environments ?? []).length),
  };

  // Active workspace object (used for syncConfig / branch in GlobalFooter)
  const currentWorkspace = (config.workspaces ?? []).find((w) => w.id === wsId) ?? null;

  // Right-side stats for the global footer — panel-specific counts / info
  const footerRightContent = useMemo(() => {
    const pl = (n: number, s: string) => `${n} ${s}${n !== 1 ? "s" : ""}`;
    switch (panel) {
      case "capture":
        if (!captureStats) return null;
        return (
          <>
            <span>{captureStats.total} captured</span>
            {captureStats.shown < captureStats.total && (
              <span>· {captureStats.shown} shown</span>
            )}
            {captureStats.paused && <span className="text-yellow">· paused</span>}
            <span className="opacity-50">newest first · last 200 kept</span>
          </>
        );
      case "mock-rest": return <span>{pl(wsConfig.mocks?.length ?? 0, "mock")}</span>;
      case "req-rest": return <span>{pl(wsConfig.requests?.length ?? 0, "request")}</span>;
      case "sockets": return <span>{pl(wsConfig.wsConnections?.length ?? 0, "socket")}</span>;
      case "webhooks": return <span>{pl(wsConfig.webhooks?.length ?? 0, "webhook")}</span>;
      case "mappings": return <span>{pl(wsConfig.mappings?.length ?? 0, "mapping")}</span>;
      case "rules": return <span>{pl(wsConfig.proxyRules?.length ?? 0, "rule")}</span>;
      case "environments": return <span>{pl(wsConfig.environments?.length ?? 0, "environment")}</span>;
      case "services": return <span>{pl(services.length, "service")}</span>;
      default: return null;
    }
  }, [panel, captureStats, wsConfig, services]);

  if (wsLoading) {
    return (
      <div className="flex flex-col h-screen bg-bg0 text-text-base select-none overflow-hidden items-center justify-center gap-3">
        <div className="text-text-dim text-sm animate-pulse">{wsLoading}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg0 text-text-base select-none overflow-hidden">
      <TitleBar
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen((v) => !v)}
        config={config}
        serverRunning={serverRunning}
        serverError={serverError}
        helpText={PANEL_HELP[panel]}
        onServerStart={async () => {
          await window.api.startServer();
          const status = await window.api.serverStatus();
          setServerRunning(status.running);
          setServerError(status.error);
        }}
        onServerStop={async () => {
          await window.api.stopServer();
          setServerRunning(false);
          setServerError(null);
        }}
        onEnvChange={async (id) => {
          await window.api.setActiveEnvironment(id);
          const fresh = await window.api.getConfig();
          setConfig(fresh);
        }}
        onManageEnvs={() => setPanel("environments")}
        onWorkspaceChange={async (id) => {
          clearWorkspaceContext("Switching workspace…");
          try {
            const result = await window.api.setActiveWorkspace(id);
            if (result.ok) {
              setConfig(result.config);
              refreshEntitySyncStatus(id);
            }
          } finally {
            setWsLoading(null);
          }
        }}
        onWorkspaceCreate={async () => {
          clearWorkspaceContext("Creating workspace…");
          try {
            const ws = await window.api.addWorkspace("");
            const result = await window.api.setActiveWorkspace(ws.id);
            if (result.ok) { setConfig(result.config); setPanel("workspace"); }
          } finally {
            setWsLoading(null);
          }
        }}
        onWorkspaceRename={async (id, name) => {
          await window.api.renameWorkspace(id, name);
          const fresh = await window.api.getConfig();
          setConfig(fresh);
        }}
        onWorkspaceDelete={async (id) => {
          clearWorkspaceContext("Switching workspace…");
          localStorage.removeItem(`capture:entries:${id}`);
          try {
            await window.api.deleteWorkspace(id);
            const fresh = await window.api.getConfig();
            setConfig(fresh);
          } finally {
            setWsLoading(null);
          }
        }}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <nav
          className="bg-bg1 border-r border-border flex flex-col flex-shrink-0 overflow-hidden sidebar-collapse"
          style={{ width: sidebarOpen ? "192px" : "0px", opacity: sidebarOpen ? 1 : 0 }}
        >
          <div className="w-48 flex flex-col p-2 gap-0.5 overflow-y-auto overflow-x-hidden">
            {/* Routing (flat section) */}
            {NAV_FLAT_SECTIONS.map((section) => (
              <React.Fragment key={section.label}>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-text-dim px-2.5 pt-3 pb-1 whitespace-nowrap">
                  {section.label}
                </div>
                {section.items.map((n) => (
                  <NavItem
                    key={n.id}
                    {...n}
                    active={panel === n.id}
                    badge={navBadges[n.id]}
                    onClick={() => setPanel(n.id)}
                  />
                ))}
              </React.Fragment>
            ))}

            {/* Mock section (collapsible) */}
            <NavSection
              label="Mock"
              items={NAV_MOCK_ITEMS}
              activePanel={panel}
              badges={navBadges as Record<string, number | undefined>}
              onSelect={(id) => setPanel(id as Panel)}
              storageKey="mock"
            />

            {/* Request section (collapsible) */}
            <NavSection
              label="Request"
              items={NAV_REQUEST_ITEMS}
              activePanel={panel}
              badges={navBadges as Record<string, number | undefined>}
              onSelect={(id) => setPanel(id as Panel)}
              storageKey="request"
            />

            {/* Bottom flat sections */}
            {NAV_BOTTOM_SECTIONS.map((section) => (
              <React.Fragment key={section.label}>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-text-dim px-2.5 pt-3 pb-1 whitespace-nowrap">
                  {section.label}
                </div>
                {section.items.map((n) => (
                  <NavItem
                    key={n.id}
                    {...n}
                    active={panel === n.id}
                    badge={navBadges[n.id]}
                    onClick={() => setPanel(n.id)}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          {panel === "services" && (
            <ServicesPanel
              services={services}
              config={wsConfig}
              onRefresh={refreshServices}
              onQuickMap={(target) => { setMappingPrefill(target); setPanel("mappings"); }}
            />
          )}
          {panel === "mappings" && (
            <MappingsPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              onRefreshServices={refreshServices}
              prefillTarget={mappingPrefill}
              onPrefillConsumed={() => setMappingPrefill(undefined)}
              onHistoryOpen={openHistory}
              entitySyncStatus={entitySyncStatus}
              onPublish={makeFlatPublish("mappings")}
              onRevert={makeFlatRevert("mappings")}
            />
          )}
          {panel === "rules" && (
            <ProxyRulesPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              onHistoryOpen={openHistory}
              entitySyncStatus={entitySyncStatus}
              onPublishItem={makePublishItem("rules", wsConfig.ruleFolders ?? [])}
              onPublishFolder={makePublishFolder("rules", wsConfig.ruleFolders ?? [])}
              onRestoreItem={makeRestoreItem("rules", wsConfig.ruleFolders ?? [])}
            />
          )}
          {panel === "capture" && (
            <CapturePanel
              activeWorkspaceId={wsId}
              onOpenInMocks={handleOpenMockEditor}
              onOpenInRequests={handleOpenInRequests}
              onStatsChange={setCaptureStats}
            />
          )}
          {panel === "req-rest" && (
            <RequestsPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              pendingOpenRequest={pendingOpenRequest}
              onPendingConsumed={() => setPendingOpenRequest(null)}
              onOpenMockEditor={handleOpenMockEditor}
              activeEnv={activeEnv}
              onHistoryOpen={openHistory}
              onEntityPathChange={handleEntityPathChange}
              historyOpen={historyOpen}
              onAfterSave={bumpHistoryReload}
              entitySyncStatus={entitySyncStatus}
              onPublishItem={makePublishItem("requests", wsConfig.requestFolders ?? [])}
              onPublishFolder={makePublishFolder("requests", wsConfig.requestFolders ?? [])}
              onRestoreItem={makeRestoreItem("requests", wsConfig.requestFolders ?? [])}
            />
          )}
          {panel === "mock-rest" && (
            <MocksPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              pendingMockInitial={pendingMockInitial}
              onPendingConsumed={() => setPendingMockInitial(null)}
              activeEnv={activeEnv}
              onHistoryOpen={openHistory}
              onEntityPathChange={handleEntityPathChange}
              historyOpen={historyOpen}
              onAfterSave={bumpHistoryReload}
              entitySyncStatus={entitySyncStatus}
              onPublishItem={makePublishItem("mocks", wsConfig.mockFolders ?? [])}
              onPublishFolder={makePublishFolder("mocks", wsConfig.mockFolders ?? [])}
              onRestoreItem={makeRestoreItem("mocks", wsConfig.mockFolders ?? [])}
            />
          )}
          {panel === "req-graphql" && (
            <GraphQLRequestsPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              activeEnv={activeEnv}
            />
          )}
          {panel === "mock-graphql" && (
            <GraphQLMocksPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              activeEnv={activeEnv}
            />
          )}
          {panel === "req-soap" && (
            <SoapRequestsPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              activeEnv={activeEnv}
            />
          )}
          {panel === "mock-soap" && (
            <SoapMocksPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              activeEnv={activeEnv}
            />
          )}
          {panel === "req-grpc" && (
            <GrpcRequestsPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              activeEnv={activeEnv}
            />
          )}
          {panel === "mock-grpc" && (
            <GrpcMocksPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              activeEnv={activeEnv}
            />
          )}
          {panel === "sockets" && (
            <WebSocketsPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              activeEnv={activeEnv}
              onHistoryOpen={openHistory}
              onEntityPathChange={handleEntityPathChange}
              historyOpen={historyOpen}
              onAfterSave={bumpHistoryReload}
              entitySyncStatus={entitySyncStatus}
              onPublishItem={makePublishItem("sockets", wsConfig.wsFolders ?? [])}
              onPublishFolder={makePublishFolder("sockets", wsConfig.wsFolders ?? [])}
              onRestoreItem={makeRestoreItem("sockets", wsConfig.wsFolders ?? [])}
            />
          )}
          {panel === "webhooks" && (
            <WebhooksPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              onHistoryOpen={openHistory}
              onEntityPathChange={handleEntityPathChange}
              historyOpen={historyOpen}
              onAfterSave={bumpHistoryReload}
              entitySyncStatus={entitySyncStatus}
              onPublishItem={makePublishItem("webhooks", wsConfig.webhookFolders ?? [])}
              onPublishFolder={makePublishFolder("webhooks", wsConfig.webhookFolders ?? [])}
              onRestoreItem={makeRestoreItem("webhooks", wsConfig.webhookFolders ?? [])}
            />
          )}
          {panel === "environments" && (
            <EnvironmentsPanel
              config={wsConfig}
              onConfigChange={handleWsConfigChange}
              onHistoryOpen={openHistory}
              onAfterSave={bumpHistoryReload}
            />
          )}
          {panel === "audit" && (
            <AuditLogPanel activeWorkspaceId={wsId} />
          )}
          {panel === "settings" && (
            <SettingsPanel
              config={config}
              serverRunning={serverRunning}
              serverError={serverError}
              onConfigChange={handleConfigChange}
              theme={theme}
              onThemeChange={setTheme}
              onServerRestart={async () => {
                await window.api.restartServer();
                const status = await window.api.serverStatus();
                setServerRunning(status.running);
                setServerError(status.error);
              }}
            />
          )}
          {panel === "workspace" && (
            <WorkspacePanel
              config={config}
              onConfigChange={(fresh) => setConfig(fresh)}
              onWorkspaceRename={async (id, name) => {
                await window.api.renameWorkspace(id, name);
                const fresh = await window.api.getConfig();
                setConfig(fresh);
              }}
              onWorkspaceDelete={async (id) => {
                localStorage.removeItem(`capture:entries:${id}`);
                await window.api.deleteWorkspace(id);
                const fresh = await window.api.getConfig();
                setConfig(fresh);
                setPanel("services");
              }}
            />
          )}
          {panel === "healthbar" && (
            <HealthBarPanel
              config={wsConfig}
              entitySyncStatus={entitySyncStatus}
              onPublish={handlePublishHealthBar}
              onAfterSave={() => refreshEntitySyncStatus(wsId)}
            />
          )}

        </main>

        {/* Right History Sidebar — always mounted so close animates */}
        <HistorySidebar
          filePath={openedEntityPath}
          workspaceId={wsId}
          onClose={closeHistory}
          open={historyOpen}
          reloadKey={historyReloadKey}
        />
      </div>

      {/* Global footer — always visible, shows git sync status for current panel */}
      <GlobalFooter
        panel={panel}
        workspace={currentWorkspace}
        entitySyncStatus={entitySyncStatus}
        syncStatus={syncStatus}
        onPublishPanel={handlePublishPanel}
        rightContent={footerRightContent}
      />
    </div>
  );
}
