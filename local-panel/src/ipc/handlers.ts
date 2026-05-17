import { ipcMain, dialog, BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";
import { executeIpcScript, IpcScriptOpts } from "@/proxy/scriptExecutor";
import {
  loadConfig, saveConfig, loadEntity, generateId, AppConfig,
  LocalMapping, ProxyRule, MockRule, SavedRequest,
  SavedWsConnection, SavedWebhook, Folder, Environment, Workspace,
} from "@/store/config";
import {
  queryLog, getEntityAtCommit, getCommitChangedFiles, QueryLogOptions, AuditEntity,
} from "@/store/gitStore";
import {
  readAllEntities,
  writeEntity, deleteEntityFile, writeFlatEntity, deleteFlatEntityFile,
  entityRelPath, flatEntityRelPath,
  writeIndex, readIndex, initWorkspaceDir,
  deleteEntityDir, sanitizeDirName, wsDir as workspaceDir,
  readEnabledSet, writeEnabledSet, bootstrapEnabledSet,
  upsertNameEntry, removeNameEntry,
  addPendingDeletion, removePendingDeletion, getPendingDeletions, clearPendingDeletions,
  findEntityRelPath,
} from "@/store/workspaceFs";
import { initWorkspaceRepo, getGit } from "@/store/gitStore";
import { loadSettings, saveSettings, appDataDir } from "@/store/appSettings";
import { discoverServices } from "@/proxy/service-discovery";
import {
  startServer, stopServer, isRunning, getPort, getServerError,
  reloadConfig, logEmitter, RequestLogEntry, replayRequest,
} from "@/proxy/server";
import {
  startWebhookServer, stopWebhookServer, isWebhookServerRunning,
  getWebhookPort, getWebhookServerError,
  registerActiveWebhook, unregisterActiveWebhook,
} from "@/proxy/webhookServer";
import { updateTrayMenu, getMainWindow } from "@/main";
import { generateRandomWorkspaceName } from "@/lib/randomNames";
import { gateCreate } from "@/subscription/entityCount";
import { generateCA, installCA, getCertStatus } from "@/proxy/certManager";
import {
  setRemote, disconnect, syncPush, syncPull, getSyncState, setAutoSync,
  onSyncStatusChange, getSyncConfig, getRemoteHead,
} from "@/sync/syncManager";
import { startAutoSync, stopAutoSync, updateLastKnownHead } from "@/sync/autoSync";
import { publishEntities, restoreEntity } from "@/sync/publishService";
import { getWorkspaceSyncStatus, invalidateCache } from "@/sync/statusTracker";

/** Returns true if the relative path has ever been committed to the workspace git repo. */
async function isGitTracked(wsId: string, relPath: string): Promise<boolean> {
  try {
    const result = await getGit(wsId).raw(["ls-files", "--error-unmatch", "--", relPath]);
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

function syncEnabledSet(wsId: string, kind: string, id: string, enabled: boolean): void {
  let set = readEnabledSet(wsId, kind);
  if (!set) set = bootstrapEnabledSet(wsId, kind);
  if (enabled) set.add(id); else set.delete(id);
  writeEnabledSet(wsId, kind, set);
}

import { registerImportExportHandlers } from "@/ipc/importExport/index";

export function registerIpcHandlers(): void {
  registerImportExportHandlers();
  // Forward sync status events to every open window
  onSyncStatusChange((wsId, state) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send("sync:status", { wsId, ...state });
    });
  });

  // Forward request log entries to every open window
  logEmitter.on("request", (entry: RequestLogEntry) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send("log:entry", entry);
    });
  });

  // Forward streaming log chunks to every open window
  logEmitter.on("chunk", (chunk: { logId: string; chunk: string; done: boolean }) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send("log:chunk", chunk);
    });
  });

  // Forward server errors to every open window
  logEmitter.on("server-error", (error: string) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send("server:error", error);
    });
  });

  ipcMain.handle("config:get", () => loadConfig());

  ipcMain.handle("config:save", (_e, incoming: AppConfig) => {
    const prev = loadConfig();
    saveConfig(incoming);
    reloadConfig();
    updateTrayMenu();
    const tlsChanged = incoming.tlsEnabled !== prev.tlsEnabled
      || incoming.tlsCaCertPath !== prev.tlsCaCertPath
      || incoming.tlsCaKeyPath !== prev.tlsCaKeyPath;
    if (!isRunning() || incoming.port !== prev.port || tlsChanged) {
      stopServer();
      startServer(incoming.port);
    }
    if (incoming.companionPort !== prev.companionPort) {
      const { restartCompanionServer } = require("@/companion/companionServer");
      restartCompanionServer(incoming.companionPort);
    }
    return { ok: true };
  });

  ipcMain.handle("tls:generate", async () => {
    try {
      const { certPath, keyPath } = await generateCA(appDataDir());
      return { ok: true, certPath, keyPath };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("tls:installCA", () => {
    const certPath = path.join(appDataDir(), "ca-cert.pem");
    if (!fs.existsSync(certPath)) return { ok: false, error: "No CA certificate found. Generate one first." };
    return installCA(certPath);
  });

  ipcMain.handle("tls:exportCert", async () => {
    const certPath = path.join(appDataDir(), "ca-cert.pem");
    if (!fs.existsSync(certPath)) return { ok: false, error: "No CA certificate found." };
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Export CA Certificate",
      defaultPath: "local-panel-ca.pem",
      filters: [{ name: "Certificate", extensions: ["pem", "crt", "cer"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.copyFileSync(certPath, filePath);
    return { ok: true, filePath };
  });

  ipcMain.handle("tls:certStatus", () => getCertStatus(appDataDir()));

  ipcMain.handle("tls:importCert", async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Select CA Certificate",
      filters: [{ name: "Certificate", extensions: ["pem", "crt", "cer"] }],
      properties: ["openFile"],
    });
    if (canceled || !filePaths[0]) return { ok: false };
    const destPath = path.join(appDataDir(), "ca-cert.pem");
    fs.copyFileSync(filePaths[0], destPath);
    return { ok: true, path: destPath };
  });

  ipcMain.handle("tls:importKey", async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Select CA Private Key",
      filters: [{ name: "Private Key", extensions: ["pem", "key"] }],
      properties: ["openFile"],
    });
    if (canceled || !filePaths[0]) return { ok: false };
    const destPath = path.join(appDataDir(), "ca-key.pem");
    fs.copyFileSync(filePaths[0], destPath);
    return { ok: true, path: destPath };
  });

  ipcMain.handle("tls:removeCert", () => {
    const certPath = path.join(appDataDir(), "ca-cert.pem");
    const keyPath = path.join(appDataDir(), "ca-key.pem");
    try { if (fs.existsSync(certPath)) fs.unlinkSync(certPath); } catch { /* ignore */ }
    try { if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath); } catch { /* ignore */ }
    return { ok: true };
  });

  // Load a single entity on-demand (called when a tab is opened)
  // Injects `enabled` from enabled.json for entity kinds that support enable/disable.
  ipcMain.handle("entity:load", (_e, wsId: string, kind: string, id: string) => {
    const entity = loadEntity(wsId, kind, id);
    if (!entity) return { ok: false };
    const enabledKinds = new Set(["mocks", "mappings", "rules", "graphqlMocks", "soapMocks", "grpcMocks"]);
    if (enabledKinds.has(kind)) {
      const set = readEnabledSet(wsId, kind);
      return { ok: true, entity: { ...entity as object, enabled: set ? set.has(id) : false } };
    }
    return { ok: true, entity };
  });

  // Toggle enabled state for any enableable entity (mocks, rules, mappings, graphqlMocks, soapMocks, grpcMocks).
  // This ONLY touches enabled.json — it does not re-write the entity file.
  ipcMain.handle("entity:setEnabled", async (_e, wsId: string, kind: string, id: string, enabled: boolean) => {
    const enabledKinds = new Set(["mocks", "mappings", "rules", "graphqlMocks", "soapMocks", "grpcMocks"]);
    if (!enabledKinds.has(kind)) return { ok: false, error: "invalid_kind" };

    // For mocks and rules, handle conflict resolution (disable others with same signature)
    if (enabled && kind === "mocks") {
      const cfg = loadConfig();
      const target = (cfg.mocks ?? []).find((m) => m.id === id);
      if (target) {
        const sig = `${target.method.toUpperCase()}|${target.urlPattern}|${target.capturedBody ?? ""}`;
        for (const m of cfg.mocks) {
          if (m.id !== id && m.enabled) {
            const mSig = `${m.method.toUpperCase()}|${m.urlPattern}|${m.capturedBody ?? ""}`;
            if (mSig === sig) syncEnabledSet(wsId, "mocks", m.id, false);
          }
        }
      }
    }
    if (enabled && kind === "rules") {
      const cfg = loadConfig();
      const target = (cfg.proxyRules ?? []).find((r) => r.id === id);
      if (target) {
        const sig = `${target.useRegex ? "re" : "exact"}|${target.pattern}`;
        for (const r of cfg.proxyRules) {
          if (r.id !== id && r.enabled) {
            const rSig = `${r.useRegex ? "re" : "exact"}|${r.pattern}`;
            if (rSig === sig) syncEnabledSet(wsId, "rules", r.id, false);
          }
        }
      }
    }

    syncEnabledSet(wsId, kind, id, enabled);
    reloadConfig();
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("services:discover", () => discoverServices());

  // ── Mappings ───────────────────────────────────────────────────────────────

  ipcMain.handle("mapping:add", async (_e, mapping: Omit<LocalMapping, "id">) => {
    const cfg = loadConfig();
    const wsId = mapping.workspaceId ?? cfg.activeWorkspaceId;
    const newMapping: LocalMapping = { ...mapping, id: generateId(), workspaceId: wsId };
    cfg.mappings = [...(cfg.mappings ?? []), newMapping];
    saveConfig(cfg);
    reloadConfig();
    writeFlatEntity(wsId, "mappings", newMapping.id, newMapping);
    syncEnabledSet(wsId, "mappings", newMapping.id, newMapping.enabled);
    return newMapping;
  });

  ipcMain.handle("mapping:update", async (_e, mapping: LocalMapping) => {
    const cfg = loadConfig();
    const wsId = mapping.workspaceId ?? cfg.activeWorkspaceId;
    const idx = cfg.mappings.findIndex((m) => m.id === mapping.id);
    if (idx !== -1) cfg.mappings[idx] = mapping;
    saveConfig(cfg);
    reloadConfig();
    writeFlatEntity(wsId, "mappings", mapping.id, mapping);
    return { ok: true };
  });

  ipcMain.handle("mapping:delete", async (_e, id: string) => {
    const cfg = loadConfig();
    const mapping = cfg.mappings.find((m) => m.id === id);
    cfg.mappings = cfg.mappings.filter((m) => m.id !== id);
    cfg.proxyRules = cfg.proxyRules.filter((r) => (r.targetType ?? "mapping") !== "mapping" || r.targetMappingId !== id);
    saveConfig(cfg);
    reloadConfig();
    if (mapping) {
      deleteFlatEntityFile(mapping.workspaceId, "mappings", id);
      syncEnabledSet(mapping.workspaceId, "mappings", id, false);
    }
    return { ok: true };
  });

  // ── Proxy Rules ────────────────────────────────────────────────────────────

  function ruleSignature(r: Pick<ProxyRule, "pattern" | "useRegex">): string {
    return `${r.useRegex ? "re" : "exact"}|${r.pattern}`;
  }

  function disableRuleConflicts(rules: ProxyRule[], target: ProxyRule): void {
    if (!target.enabled) return;
    const sig = ruleSignature(target);
    for (const r of rules) {
      if (r.id !== target.id && r.enabled && ruleSignature(r) === sig) {
        r.enabled = false;
      }
    }
  }

  ipcMain.handle("rule:add", async (_e, rule: Omit<ProxyRule, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = rule.workspaceId ?? cfg.activeWorkspaceId;
    const newRule: ProxyRule = { ...rule, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    cfg.proxyRules = cfg.proxyRules ?? [];
    disableRuleConflicts(cfg.proxyRules, newRule);
    for (const r of cfg.proxyRules) {
      if (r.id !== newRule.id && !r.enabled) syncEnabledSet(wsId, "rules", r.id, false);
    }
    cfg.proxyRules.unshift(newRule);
    saveConfig(cfg);
    reloadConfig();
    const folderName = newRule.folderId ? (cfg.ruleFolders ?? []).find((f) => f.id === newRule.folderId)?.name : null;
    writeEntity(wsId, "rules", newRule.id, newRule, folderName ?? null);
    syncEnabledSet(wsId, "rules", newRule.id, newRule.enabled);
    upsertNameEntry(wsId, "rules", newRule.id, { name: newRule.name, url: newRule.pattern });
    broadcastEntityStatus(wsId);
    return newRule;
  });

  ipcMain.handle("rule:update", async (_e, rule: ProxyRule) => {
    const cfg = loadConfig();
    const wsId = rule.workspaceId ?? cfg.activeWorkspaceId;
    cfg.proxyRules = cfg.proxyRules ?? [];
    const idx = cfg.proxyRules.findIndex((r) => r.id === rule.id);
    if (idx !== -1) cfg.proxyRules[idx] = rule;
    saveConfig(cfg);
    reloadConfig();
    const folderName = rule.folderId ? (cfg.ruleFolders ?? []).find((f) => f.id === rule.folderId)?.name : null;
    writeEntity(wsId, "rules", rule.id, rule, folderName ?? null);
    upsertNameEntry(wsId, "rules", rule.id, { name: rule.name, url: rule.pattern });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("rule:delete", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const rule = (cfg.proxyRules ?? []).find((r) => r.id === id);
    if (rule) {
      const relPath = findEntityRelPath(wsId, "rules", id);
      const tracked = relPath ? await isGitTracked(wsId, relPath) : false;
      deleteEntityFile(wsId, "rules", id);
      syncEnabledSet(wsId, "rules", id, false);
      if (tracked) {
        addPendingDeletion(wsId, "rules", { id, folderId: rule.folderId ?? null, name: rule.name, url: rule.pattern });
      } else {
        removeNameEntry(wsId, "rules", id);
      }
      reloadConfig();
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  // ── Mocks ──────────────────────────────────────────────────────────────────

  function mockSignature(m: Pick<MockRule, "method" | "urlPattern" | "capturedBody">): string {
    return `${m.method.toUpperCase()}|${m.urlPattern}|${m.capturedBody ?? ""}`;
  }

  function disableConflicts(mocks: MockRule[], target: MockRule): void {
    if (!target.enabled) return;
    const sig = mockSignature(target);
    for (const m of mocks) {
      if (m.id !== target.id && m.enabled && mockSignature(m) === sig) {
        m.enabled = false;
      }
    }
  }

  ipcMain.handle("mock:add", async (_e, mock: Omit<MockRule, "id" | "createdAt">) => {
    // Validate required fields
    if (!mock.urlPattern || !mock.urlPattern.trim()) {
      throw new Error("urlPattern is required for mocks");
    }
    if (!mock.method || !mock.method.trim()) {
      throw new Error("method is required for mocks");
    }

    const cfg = loadConfig();
    const wsId = mock.workspaceId ?? cfg.activeWorkspaceId;
    const newMock: MockRule = { ...mock, id: generateId(), createdAt: Date.now(), workspaceId: wsId, enabled: mock.enabled ?? true };
    cfg.mocks = cfg.mocks ?? [];
    disableConflicts(cfg.mocks, newMock);
    // Persist disabled state for any conflicts
    for (const m of cfg.mocks) {
      if (m.id !== newMock.id && !m.enabled) syncEnabledSet(wsId, "mocks", m.id, false);
    }
    cfg.mocks.unshift(newMock);
    saveConfig(cfg);
    reloadConfig();
    const folderName = newMock.folderId ? (cfg.mockFolders ?? []).find((f) => f.id === newMock.folderId)?.name : null;
    writeEntity(wsId, "mocks", newMock.id, newMock, folderName);
    syncEnabledSet(wsId, "mocks", newMock.id, newMock.enabled);
    upsertNameEntry(wsId, "mocks", newMock.id, { name: newMock.name, method: newMock.method, url: newMock.urlPattern });
    broadcastEntityStatus(wsId);
    return newMock;
  });

  ipcMain.handle("mock:update", async (_e, mock: MockRule) => {
    const cfg = loadConfig();
    const wsId = mock.workspaceId ?? cfg.activeWorkspaceId;
    cfg.mocks = cfg.mocks ?? [];
    const idx = cfg.mocks.findIndex((m) => m.id === mock.id);
    if (idx !== -1) cfg.mocks[idx] = mock;
    saveConfig(cfg);
    reloadConfig();
    const folderName = mock.folderId ? (cfg.mockFolders ?? []).find((f) => f.id === mock.folderId)?.name : null;
    writeEntity(wsId, "mocks", mock.id, mock, folderName);
    upsertNameEntry(wsId, "mocks", mock.id, { name: mock.name, method: mock.method, url: mock.urlPattern });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("mock:delete", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const mock = (cfg.mocks ?? []).find((m) => m.id === id);
    if (mock) {
      const relPath = findEntityRelPath(wsId, "mocks", id);
      const tracked = relPath ? await isGitTracked(wsId, relPath) : false;
      deleteEntityFile(wsId, "mocks", id);
      syncEnabledSet(wsId, "mocks", id, false);
      if (tracked) {
        addPendingDeletion(wsId, "mocks", { id, folderId: mock.folderId ?? null, name: mock.name, method: mock.method, url: mock.urlPattern });
      } else {
        removeNameEntry(wsId, "mocks", id);
      }
      reloadConfig();
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  // ── Saved Requests ─────────────────────────────────────────────────────────

  ipcMain.handle("request:add", async (_e, req: Omit<SavedRequest, "id" | "createdAt">) => {
    // Validate required fields
    if (!req.url || !req.url.trim()) {
      throw new Error("url is required for requests");
    }
    if (!req.method || !req.method.trim()) {
      throw new Error("method is required for requests");
    }

    const cfg = loadConfig();
    const wsId = req.workspaceId ?? cfg.activeWorkspaceId;
    const newReq: SavedRequest = { ...req, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    const folderName = newReq.folderId ? (cfg.requestFolders ?? []).find((f) => f.id === newReq.folderId)?.name : null;
    writeEntity(wsId, "requests", newReq.id, newReq, folderName);
    upsertNameEntry(wsId, "requests", newReq.id, { name: newReq.name, method: newReq.method, url: newReq.url });
    broadcastEntityStatus(wsId);
    return newReq;
  });

  ipcMain.handle("request:update", async (_e, req: SavedRequest) => {
    const cfg = loadConfig();
    const wsId = req.workspaceId ?? cfg.activeWorkspaceId;
    const folderName = req.folderId ? (cfg.requestFolders ?? []).find((f) => f.id === req.folderId)?.name : null;
    writeEntity(wsId, "requests", req.id, req, folderName);
    upsertNameEntry(wsId, "requests", req.id, { name: req.name, method: req.method, url: req.url });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("request:delete", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const req = loadEntity<SavedRequest>(wsId, "requests", id);
    if (req) {
      const relPath = findEntityRelPath(wsId, "requests", id);
      const tracked = relPath ? await isGitTracked(wsId, relPath) : false;
      deleteEntityFile(wsId, "requests", id);
      if (tracked) {
        // Published entity — track as pending deletion so user can publish the delete
        addPendingDeletion(wsId, "requests", { id, folderId: req.folderId ?? null, name: req.name, method: req.method, url: req.url });
      } else {
        // Never published — remove immediately with no pending state
        removeNameEntry(wsId, "requests", id);
      }
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  // ── WebSocket Connections ──────────────────────────────────────────────────

  ipcMain.handle("ws:add", async (_e, conn: Omit<SavedWsConnection, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = conn.workspaceId ?? cfg.activeWorkspaceId;
    const newConn: SavedWsConnection = { ...conn, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    const folderName = newConn.folderId ? (cfg.wsFolders ?? []).find((f) => f.id === newConn.folderId)?.name : null;
    writeEntity(wsId, "sockets", newConn.id, newConn, folderName);
    upsertNameEntry(wsId, "sockets", newConn.id, { name: newConn.name, url: newConn.url });
    broadcastEntityStatus(wsId);
    return newConn;
  });

  ipcMain.handle("ws:update", async (_e, conn: SavedWsConnection) => {
    const cfg = loadConfig();
    const wsId = conn.workspaceId ?? cfg.activeWorkspaceId;
    const folderName = conn.folderId ? (cfg.wsFolders ?? []).find((f) => f.id === conn.folderId)?.name : null;
    writeEntity(wsId, "sockets", conn.id, conn, folderName);
    upsertNameEntry(wsId, "sockets", conn.id, { name: conn.name, url: conn.url });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("ws:delete", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const conn = loadEntity<SavedWsConnection>(wsId, "sockets", id);
    if (conn) {
      const relPath = findEntityRelPath(wsId, "sockets", id);
      const tracked = relPath ? await isGitTracked(wsId, relPath) : false;
      deleteEntityFile(wsId, "sockets", id);
      if (tracked) {
        addPendingDeletion(wsId, "sockets", { id, folderId: conn.folderId ?? null, name: conn.name, url: conn.url });
      } else {
        removeNameEntry(wsId, "sockets", id);
      }
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  // ── Webhooks ───────────────────────────────────────────────────────────────

  ipcMain.handle("webhook:add", async (_e, hook: Omit<SavedWebhook, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = hook.workspaceId ?? cfg.activeWorkspaceId;
    const newHook: SavedWebhook = { ...hook, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    const folderName = newHook.folderId ? (cfg.webhookFolders ?? []).find((f) => f.id === newHook.folderId)?.name : null;
    writeEntity(wsId, "webhooks", newHook.id, newHook, folderName);
    upsertNameEntry(wsId, "webhooks", newHook.id, { name: newHook.name, urlSuffix: newHook.urlSuffix });
    broadcastEntityStatus(wsId);
    return newHook;
  });

  ipcMain.handle("webhook:update", async (_e, hook: SavedWebhook) => {
    const cfg = loadConfig();
    const wsId = hook.workspaceId ?? cfg.activeWorkspaceId;
    const folderName = hook.folderId ? (cfg.webhookFolders ?? []).find((f) => f.id === hook.folderId)?.name : null;
    writeEntity(wsId, "webhooks", hook.id, hook, folderName);
    upsertNameEntry(wsId, "webhooks", hook.id, { name: hook.name, urlSuffix: hook.urlSuffix });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("webhook:delete", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const hook = loadEntity<SavedWebhook>(wsId, "webhooks", id);
    if (hook) {
      const relPath = findEntityRelPath(wsId, "webhooks", id);
      const tracked = relPath ? await isGitTracked(wsId, relPath) : false;
      deleteEntityFile(wsId, "webhooks", id);
      if (tracked) {
        addPendingDeletion(wsId, "webhooks", { id, folderId: hook.folderId ?? null, name: hook.name, urlSuffix: hook.urlSuffix });
      } else {
        removeNameEntry(wsId, "webhooks", id);
      }
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  // Register/unregister active webhook (tab open/close)
  ipcMain.handle("webhook:registerActive", (_e, webhookId: string, urlSuffix: string) => {
    registerActiveWebhook(webhookId, urlSuffix);
    return { ok: true };
  });

  ipcMain.handle("webhook:unregisterActive", (_e, webhookId: string) => {
    unregisterActiveWebhook(webhookId);
    return { ok: true };
  });

  // Webhook server lifecycle
  ipcMain.handle("webhookServer:start", () => {
    const cfg = loadConfig();
    startWebhookServer(cfg.webhookPort ?? 9101);
    return { ok: true };
  });

  ipcMain.handle("webhookServer:stop", () => {
    stopWebhookServer();
    return { ok: true };
  });

  ipcMain.handle("webhookServer:status", () => ({
    running: isWebhookServerRunning(),
    port: getWebhookPort(),
    error: getWebhookServerError(),
  }));

  // ── SOAP ───────────────────────────────────────────────────────────────────

  interface SavedSoapRequest {
    id: string; name: string; endpointUrl: string; soapAction: string;
    headers: Record<string, string>; body: string; wsdlId?: string | null;
    operationName?: string; preScript?: string; postScript?: string;
    createdAt: number; folderId?: string | null; workspaceId: string;
  }

  interface SavedSoapMock {
    id: string; name: string; enabled: boolean; endpointPattern: string; useRegex: boolean;
    soapActionPattern: string; operationName?: string;
    responseStatus: number; responseHeaders: Record<string, string>; responseBody: string;
    responseDelay?: number; wsdlId?: string | null;
    createdAt: number; folderId?: string | null; workspaceId: string;
  }

  interface SavedWsdl {
    id: string; name: string; content: string; sourceUrl?: string;
    importedAt: number; createdAt: number; workspaceId: string;
  }

  ipcMain.handle("soap:addRequest", async (_e, req: Omit<SavedSoapRequest, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = (req as any).workspaceId ?? cfg.activeWorkspaceId;
    const newReq: SavedSoapRequest = { ...req, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    const folders = (cfg as any).soapRequestFolders ?? [];
    const folderName = newReq.folderId ? folders.find((f: Folder) => f.id === newReq.folderId)?.name : null;
    writeEntity(wsId, "soapRequests", newReq.id, newReq, folderName);
    upsertNameEntry(wsId, "soapRequests", newReq.id, { name: newReq.name, endpointUrl: newReq.endpointUrl, soapAction: newReq.soapAction });
    broadcastEntityStatus(wsId);
    return newReq;
  });

  ipcMain.handle("soap:updateRequest", async (_e, req: SavedSoapRequest) => {
    const cfg = loadConfig();
    const wsId = req.workspaceId ?? cfg.activeWorkspaceId;
    const folders = (cfg as any).soapRequestFolders ?? [];
    const folderName = req.folderId ? folders.find((f: Folder) => f.id === req.folderId)?.name : null;
    writeEntity(wsId, "soapRequests", req.id, req, folderName);
    upsertNameEntry(wsId, "soapRequests", req.id, { name: req.name, endpointUrl: req.endpointUrl, soapAction: req.soapAction });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("soap:deleteRequest", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const req = loadEntity<SavedSoapRequest>(wsId, "soapRequests", id);
    if (req) {
      deleteEntityFile(wsId, "soapRequests", id);
      removeNameEntry(wsId, "soapRequests", id);
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  ipcMain.handle("soap:addMock", async (_e, mock: Omit<SavedSoapMock, "id" | "createdAt">) => {
    // Validate required fields
    if (!mock.endpointPattern || !mock.endpointPattern.trim()) {
      throw new Error("endpointPattern is required for SOAP mocks");
    }

    const cfg = loadConfig();
    const wsId = (mock as any).workspaceId ?? cfg.activeWorkspaceId;
    const newMock: SavedSoapMock = { ...mock, id: generateId(), createdAt: Date.now(), workspaceId: wsId, enabled: mock.enabled ?? true };
    const folders = (cfg as any).soapMockFolders ?? [];
    const folderName = newMock.folderId ? folders.find((f: Folder) => f.id === newMock.folderId)?.name : null;
    writeEntity(wsId, "soapMocks", newMock.id, newMock, folderName);
    syncEnabledSet(wsId, "soapMocks", newMock.id, newMock.enabled);
    upsertNameEntry(wsId, "soapMocks", newMock.id, { name: newMock.name, soapActionPattern: newMock.soapActionPattern });
    broadcastEntityStatus(wsId);
    return newMock;
  });

  ipcMain.handle("soap:updateMock", async (_e, mock: SavedSoapMock) => {
    const cfg = loadConfig();
    const wsId = mock.workspaceId ?? cfg.activeWorkspaceId;
    const folders = (cfg as any).soapMockFolders ?? [];
    const folderName = mock.folderId ? folders.find((f: Folder) => f.id === mock.folderId)?.name : null;
    writeEntity(wsId, "soapMocks", mock.id, mock, folderName);
    upsertNameEntry(wsId, "soapMocks", mock.id, { name: mock.name, soapActionPattern: mock.soapActionPattern });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("soap:deleteMock", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const mock = loadEntity<SavedSoapMock>(wsId, "soapMocks", id);
    if (mock) {
      deleteEntityFile(wsId, "soapMocks", id);
      syncEnabledSet(wsId, "soapMocks", id, false);
      removeNameEntry(wsId, "soapMocks", id);
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  ipcMain.handle("soap:addWsdl", async (_e, wsdl: Omit<SavedWsdl, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = (wsdl as any).workspaceId ?? cfg.activeWorkspaceId;
    const newWsdl: SavedWsdl = { ...wsdl, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    writeEntity(wsId, "wsdls", newWsdl.id, newWsdl, null);
    return newWsdl;
  });

  ipcMain.handle("soap:deleteWsdl", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    deleteEntityFile(wsId, "wsdls", id);
    return { ok: true };
  });

  ipcMain.handle("soap:listWsdls", async () => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    return readAllEntities<SavedWsdl>(wsId, "wsdls");
  });

  ipcMain.handle("soap:fetchWsdl", async (_e, url: string) => {
    const httpMod = url.startsWith("https") ? require("https") : require("http");
    try {
      const parsed = new URL(url);
      const content = await new Promise<string>((resolve, reject) => {
        const req = httpMod.request(
          { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: "GET", rejectUnauthorized: false },
          (res: any) => {
            let data = "";
            res.on("data", (chunk: string) => { data += chunk; });
            res.on("end", () => resolve(data));
          },
        );
        req.on("error", reject);
        req.end();
      });
      return { ok: true, content };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "Failed to fetch WSDL" };
    }
  });

  ipcMain.handle("soap:execute", async (_e, { endpointUrl, soapAction, headers, body }: { endpointUrl: string; soapAction: string; headers: Record<string, string>; body: string }) => {
    const httpMod = endpointUrl.startsWith("https") ? require("https") : require("http");
    const parsed = new URL(endpointUrl);
    const xmlBody = Buffer.from(body, "utf-8");
    const reqHeaders: Record<string, string> = {
      "Content-Type": "text/xml; charset=utf-8",
      "Content-Length": String(xmlBody.length),
      ...headers,
    };
    if (soapAction) reqHeaders["SOAPAction"] = soapAction;
    const start = Date.now();
    const { status, resHeaders, resBody } = await new Promise<{ status: number; resHeaders: Record<string, string>; resBody: string }>((resolve, reject) => {
      const req = httpMod.request(
        { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: "POST", headers: reqHeaders, rejectUnauthorized: false },
        (res: any) => {
          let data = "";
          res.on("data", (chunk: string) => { data += chunk; });
          res.on("end", () => {
            const h: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) { h[k] = Array.isArray(v) ? v.join(", ") : String(v); }
            resolve({ status: res.statusCode ?? 0, resHeaders: h, resBody: data });
          });
        },
      );
      req.on("error", reject);
      req.write(xmlBody);
      req.end();
    });
    return { status, headers: resHeaders, body: resBody, durationMs: Date.now() - start };
  });

  // ── GraphQL ────────────────────────────────────────────────────────────────

  interface SavedGraphQLRequest {
    id: string; name: string; endpointUrl: string; headers: Record<string, string>;
    query: string; variables: string; operationName: string;
    preScript?: string; postScript?: string; schemaId?: string | null;
    createdAt: number; folderId?: string | null; workspaceId: string;
  }

  interface SavedGraphQLMock {
    id: string; name: string; enabled: boolean; endpointPattern: string; useRegex: boolean;
    operationType: "query" | "mutation" | "subscription" | "any"; operationName: string;
    responseStatus: number; responseHeaders: Record<string, string>; responseBody: string;
    responseDelay?: number; schemaId?: string | null;
    createdAt: number; folderId?: string | null; workspaceId: string;
  }

  interface SavedGraphQLSchema {
    id: string; name: string; content: string; endpointUrl?: string;
    introspectedAt?: number; createdAt: number; workspaceId: string;
  }

  ipcMain.handle("graphql:addRequest", async (_e, req: Omit<SavedGraphQLRequest, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = (req as any).workspaceId ?? cfg.activeWorkspaceId;
    const newReq: SavedGraphQLRequest = { ...req, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    const folders = (cfg as any).graphqlRequestFolders ?? [];
    const folderName = newReq.folderId ? folders.find((f: Folder) => f.id === newReq.folderId)?.name : null;
    writeEntity(wsId, "graphqlRequests", newReq.id, newReq, folderName);
    upsertNameEntry(wsId, "graphqlRequests", newReq.id, { name: newReq.name, endpointUrl: newReq.endpointUrl });
    broadcastEntityStatus(wsId);
    return newReq;
  });

  ipcMain.handle("graphql:updateRequest", async (_e, req: SavedGraphQLRequest) => {
    const cfg = loadConfig();
    const wsId = req.workspaceId ?? cfg.activeWorkspaceId;
    const folders = (cfg as any).graphqlRequestFolders ?? [];
    const folderName = req.folderId ? folders.find((f: Folder) => f.id === req.folderId)?.name : null;
    writeEntity(wsId, "graphqlRequests", req.id, req, folderName);
    upsertNameEntry(wsId, "graphqlRequests", req.id, { name: req.name, endpointUrl: req.endpointUrl });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("graphql:deleteRequest", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const req = loadEntity<SavedGraphQLRequest>(wsId, "graphqlRequests", id);
    if (req) {
      deleteEntityFile(wsId, "graphqlRequests", id);
      removeNameEntry(wsId, "graphqlRequests", id);
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  ipcMain.handle("graphql:addMock", async (_e, mock: Omit<SavedGraphQLMock, "id" | "createdAt">) => {
    // Validate required fields
    if (!mock.endpointPattern || !mock.endpointPattern.trim()) {
      throw new Error("endpointPattern is required for GraphQL mocks");
    }

    const cfg = loadConfig();
    const wsId = (mock as any).workspaceId ?? cfg.activeWorkspaceId;
    const newMock: SavedGraphQLMock = { ...mock, id: generateId(), createdAt: Date.now(), workspaceId: wsId, enabled: mock.enabled ?? true };
    const folders = (cfg as any).graphqlMockFolders ?? [];
    const folderName = newMock.folderId ? folders.find((f: Folder) => f.id === newMock.folderId)?.name : null;
    writeEntity(wsId, "graphqlMocks", newMock.id, newMock, folderName);
    syncEnabledSet(wsId, "graphqlMocks", newMock.id, newMock.enabled);
    upsertNameEntry(wsId, "graphqlMocks", newMock.id, { name: newMock.name, operationName: newMock.operationName });
    broadcastEntityStatus(wsId);
    return newMock;
  });

  ipcMain.handle("graphql:updateMock", async (_e, mock: SavedGraphQLMock) => {
    const cfg = loadConfig();
    const wsId = mock.workspaceId ?? cfg.activeWorkspaceId;
    const folders = (cfg as any).graphqlMockFolders ?? [];
    const folderName = mock.folderId ? folders.find((f: Folder) => f.id === mock.folderId)?.name : null;
    writeEntity(wsId, "graphqlMocks", mock.id, mock, folderName);
    upsertNameEntry(wsId, "graphqlMocks", mock.id, { name: mock.name, operationName: mock.operationName });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("graphql:deleteMock", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const mock = loadEntity<SavedGraphQLMock>(wsId, "graphqlMocks", id);
    if (mock) {
      deleteEntityFile(wsId, "graphqlMocks", id);
      syncEnabledSet(wsId, "graphqlMocks", id, false);
      removeNameEntry(wsId, "graphqlMocks", id);
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  ipcMain.handle("graphql:addSchema", async (_e, schema: Omit<SavedGraphQLSchema, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = (schema as any).workspaceId ?? cfg.activeWorkspaceId;
    const newSchema: SavedGraphQLSchema = { ...schema, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    writeEntity(wsId, "graphqlSchemas", newSchema.id, newSchema, null);
    return newSchema;
  });

  ipcMain.handle("graphql:deleteSchema", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    deleteEntityFile(wsId, "graphqlSchemas", id);
    return { ok: true };
  });

  ipcMain.handle("graphql:listSchemas", async () => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    return readAllEntities<SavedGraphQLSchema>(wsId, "graphqlSchemas");
  });

  ipcMain.handle("graphql:introspect", async (_e, { url, headers }: { url: string; headers: Record<string, string> }) => {
    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
          types { ...FullType }
          directives { name description locations args { ...InputValue } }
        }
      }
      fragment FullType on __Type {
        kind name description
        fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason }
        inputFields { ...InputValue }
        interfaces { ...TypeRef }
        enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
        possibleTypes { ...TypeRef }
      }
      fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue }
      fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }
    `;
    try {
      const http = url.startsWith("https") ? require("https") : require("http");
      const body = JSON.stringify({ query: introspectionQuery });
      const parsed = new URL(url);
      const reqHeaders: Record<string, string> = { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)), ...headers };
      const result = await new Promise<string>((resolve, reject) => {
        const req = http.request({ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: "POST", headers: reqHeaders, rejectUnauthorized: false }, (res: any) => {
          let data = "";
          res.on("data", (chunk: string) => { data += chunk; });
          res.on("end", () => resolve(data));
        });
        req.on("error", reject);
        req.write(body);
        req.end();
      });
      return { ok: true, sdl: result };
    } catch (err: any) {
      return { ok: false, error: err.message ?? String(err) };
    }
  });

  ipcMain.handle("graphql:execute", async (_e, { url, headers, query, variables, operationName }: { url: string; headers: Record<string, string>; query: string; variables: string; operationName: string }) => {
    const http = url.startsWith("https") ? require("https") : require("http");
    let parsedVars: unknown = undefined;
    try { if (variables && variables.trim()) parsedVars = JSON.parse(variables); } catch { /* leave undefined */ }
    const body = JSON.stringify({ query, variables: parsedVars, operationName: operationName || undefined });
    const parsed = new URL(url);
    const reqHeaders: Record<string, string> = { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)), ...headers };
    const start = Date.now();
    const { status, resHeaders, resBody } = await new Promise<{ status: number; resHeaders: Record<string, string>; resBody: string }>((resolve, reject) => {
      const req = http.request({ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: "POST", headers: reqHeaders, rejectUnauthorized: false }, (res: any) => {
        let data = "";
        res.on("data", (chunk: string) => { data += chunk; });
        res.on("end", () => {
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) { h[k] = Array.isArray(v) ? v.join(", ") : String(v); }
          resolve({ status: res.statusCode ?? 0, resHeaders: h, resBody: data });
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
    return { status, headers: resHeaders, body: resBody, durationMs: Date.now() - start };
  });

  // ── gRPC ───────────────────────────────────────────────────────────────────

  interface SavedGrpcRequest {
    id: string; name: string; serverAddress: string; serviceName: string; methodName: string;
    requestBody: string; metadata: Record<string, string>; protoFileId?: string | null;
    useReflection: boolean; streamingType: "unary" | "server" | "client" | "bidi";
    preScript?: string; postScript?: string;
    createdAt: number; folderId?: string | null; workspaceId: string;
  }

  interface SavedGrpcMock {
    id: string; name: string; enabled: boolean; serviceName: string; methodName: string;
    responseBody: string; responseMetadata: Record<string, string>; responseDelay?: number;
    streamingResponses?: string[]; errorCode?: number; errorMessage?: string;
    protoFileId: string; createdAt: number; folderId?: string | null; workspaceId: string;
  }

  interface SavedProtoFile {
    id: string; name: string; content: string;
    parsedServices?: { name: string; methods: { name: string; inputType: string; outputType: string; clientStreaming: boolean; serverStreaming: boolean }[] }[];
    createdAt: number; workspaceId: string;
  }

  ipcMain.handle("grpc:addRequest", async (_e, req: Omit<SavedGrpcRequest, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = (req as any).workspaceId ?? cfg.activeWorkspaceId;
    const newReq: SavedGrpcRequest = { ...req, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    const folders = (cfg as any).grpcRequestFolders ?? [];
    const folderName = newReq.folderId ? folders.find((f: Folder) => f.id === newReq.folderId)?.name : null;
    writeEntity(wsId, "grpcRequests", newReq.id, newReq, folderName);
    upsertNameEntry(wsId, "grpcRequests", newReq.id, { name: newReq.name });
    broadcastEntityStatus(wsId);
    return newReq;
  });

  ipcMain.handle("grpc:updateRequest", async (_e, req: SavedGrpcRequest) => {
    const cfg = loadConfig();
    const wsId = req.workspaceId ?? cfg.activeWorkspaceId;
    const folders = (cfg as any).grpcRequestFolders ?? [];
    const folderName = req.folderId ? folders.find((f: Folder) => f.id === req.folderId)?.name : null;
    writeEntity(wsId, "grpcRequests", req.id, req, folderName);
    upsertNameEntry(wsId, "grpcRequests", req.id, { name: req.name });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("grpc:deleteRequest", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const req = loadEntity<SavedGrpcRequest>(wsId, "grpcRequests", id);
    if (req) {
      deleteEntityFile(wsId, "grpcRequests", id);
      removeNameEntry(wsId, "grpcRequests", id);
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  ipcMain.handle("grpc:addMock", async (_e, mock: Omit<SavedGrpcMock, "id" | "createdAt">) => {
    // Validate required fields  
    if (!mock.serviceName || !mock.serviceName.trim()) {
      throw new Error("serviceName is required for gRPC mocks");
    }
    if (!mock.methodName || !mock.methodName.trim()) {
      throw new Error("methodName is required for gRPC mocks");
    }

    const cfg = loadConfig();
    const wsId = (mock as any).workspaceId ?? cfg.activeWorkspaceId;
    const newMock: SavedGrpcMock = { ...mock, id: generateId(), createdAt: Date.now(), workspaceId: wsId, enabled: mock.enabled ?? true };
    const folders = (cfg as any).grpcMockFolders ?? [];
    const folderName = newMock.folderId ? folders.find((f: Folder) => f.id === newMock.folderId)?.name : null;
    writeEntity(wsId, "grpcMocks", newMock.id, newMock, folderName);
    syncEnabledSet(wsId, "grpcMocks", newMock.id, newMock.enabled);
    upsertNameEntry(wsId, "grpcMocks", newMock.id, { name: newMock.name });
    broadcastEntityStatus(wsId);
    return newMock;
  });

  ipcMain.handle("grpc:updateMock", async (_e, mock: SavedGrpcMock) => {
    const cfg = loadConfig();
    const wsId = mock.workspaceId ?? cfg.activeWorkspaceId;
    const folders = (cfg as any).grpcMockFolders ?? [];
    const folderName = mock.folderId ? folders.find((f: Folder) => f.id === mock.folderId)?.name : null;
    writeEntity(wsId, "grpcMocks", mock.id, mock, folderName);
    upsertNameEntry(wsId, "grpcMocks", mock.id, { name: mock.name });
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("grpc:deleteMock", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    const mock = loadEntity<SavedGrpcMock>(wsId, "grpcMocks", id);
    if (mock) {
      deleteEntityFile(wsId, "grpcMocks", id);
      syncEnabledSet(wsId, "grpcMocks", id, false);
      removeNameEntry(wsId, "grpcMocks", id);
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return { ok: true };
  });

  ipcMain.handle("grpc:addProto", async (_e, proto: Omit<SavedProtoFile, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = (proto as any).workspaceId ?? cfg.activeWorkspaceId;
    const newProto: SavedProtoFile = { ...proto, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    writeEntity(wsId, "protoFiles", newProto.id, newProto, null);
    return newProto;
  });

  ipcMain.handle("grpc:deleteProto", async (_e, id: string) => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    deleteEntityFile(wsId, "protoFiles", id);
    return { ok: true };
  });

  ipcMain.handle("grpc:listProtos", async () => {
    const cfg = loadConfig();
    const wsId = cfg.activeWorkspaceId;
    return readAllEntities<SavedProtoFile>(wsId, "protoFiles");
  });

  ipcMain.handle("grpc:execute", async (_e, { serverAddress, serviceName, methodName, requestBody, metadata, protoFileId, useReflection }: {
    serverAddress: string; serviceName: string; methodName: string; requestBody: string;
    metadata: Record<string, string>; protoFileId: string | null; useReflection: boolean;
  }) => {
    // Stub: gRPC execution requires @grpc/grpc-js. Return informative error.
    return { ok: false, error: "gRPC runtime not yet configured. Install @grpc/grpc-js and @grpc/proto-loader to enable gRPC calls." };
  });

  ipcMain.handle("grpc:reflect", async (_e, { serverAddress }: { serverAddress: string }) => {
    // Stub: gRPC reflection requires @grpc/grpc-js.
    return { ok: false, error: "gRPC runtime not yet configured. Install @grpc/grpc-js to enable server reflection." };
  });

  ipcMain.handle("grpc:mockServerStatus", async () => {
    return { running: false, port: 9102 };
  });

  ipcMain.handle("grpc:startMockServer", async () => {
    return { ok: false, error: "gRPC mock server not yet implemented. Install @grpc/grpc-js to enable." };
  });

  ipcMain.handle("grpc:stopMockServer", async () => {
    return { ok: true };
  });

  // ── Folders ────────────────────────────────────────────────────────────────

  ipcMain.handle("folder:add", async (_e, kind: "mock" | "request" | "ws" | "webhook" | "rule" | "graphqlRequest" | "graphqlMock" | "grpcRequest" | "grpcMock" | "soapRequest" | "soapMock", folder: Omit<Folder, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = folder.workspaceId ?? cfg.activeWorkspaceId;
    const newFolder: Folder = { ...folder, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    const kindMap = { mock: "mocks", request: "requests", ws: "sockets", webhook: "webhooks", rule: "rules", graphqlRequest: "graphqlRequests", graphqlMock: "graphqlMocks", grpcRequest: "grpcRequests", grpcMock: "grpcMocks", soapRequest: "soapRequests", soapMock: "soapMocks" } as const;
    const fsKind = kindMap[kind];
    if (kind === "mock") {
      cfg.mockFolders = cfg.mockFolders ?? [];
      cfg.mockFolders.push(newFolder);
    } else if (kind === "ws") {
      cfg.wsFolders = cfg.wsFolders ?? [];
      cfg.wsFolders.push(newFolder);
    } else if (kind === "webhook") {
      cfg.webhookFolders = cfg.webhookFolders ?? [];
      cfg.webhookFolders.push(newFolder);
    } else if (kind === "rule") {
      cfg.ruleFolders = cfg.ruleFolders ?? [];
      cfg.ruleFolders.push(newFolder);
    } else if (kind === "graphqlRequest") {
      (cfg as any).graphqlRequestFolders = (cfg as any).graphqlRequestFolders ?? [];
      (cfg as any).graphqlRequestFolders.push(newFolder);
    } else if (kind === "graphqlMock") {
      (cfg as any).graphqlMockFolders = (cfg as any).graphqlMockFolders ?? [];
      (cfg as any).graphqlMockFolders.push(newFolder);
    } else if (kind === "grpcRequest") {
      (cfg as any).grpcRequestFolders = (cfg as any).grpcRequestFolders ?? [];
      (cfg as any).grpcRequestFolders.push(newFolder);
    } else if (kind === "grpcMock") {
      (cfg as any).grpcMockFolders = (cfg as any).grpcMockFolders ?? [];
      (cfg as any).grpcMockFolders.push(newFolder);
    } else if (kind === "soapRequest") {
      (cfg as any).soapRequestFolders = (cfg as any).soapRequestFolders ?? [];
      (cfg as any).soapRequestFolders.push(newFolder);
    } else if (kind === "soapMock") {
      (cfg as any).soapMockFolders = (cfg as any).soapMockFolders ?? [];
      (cfg as any).soapMockFolders.push(newFolder);
    } else {
      cfg.requestFolders = cfg.requestFolders ?? [];
      cfg.requestFolders.push(newFolder);
    }
    saveConfig(cfg);
    // Create the physical directory for the folder
    const folderDir = path.join(workspaceDir(wsId), fsKind, sanitizeDirName(newFolder.name));
    fs.mkdirSync(folderDir, { recursive: true });
    // Update index file
    const idx = readIndex(wsId, fsKind);
    idx.folders.push(newFolder);
    writeIndex(wsId, fsKind, idx);
    return newFolder;
  });

  ipcMain.handle("folder:rename", (_e, kind: "mock" | "request" | "ws" | "webhook" | "rule" | "graphqlRequest" | "graphqlMock" | "grpcRequest" | "grpcMock" | "soapRequest" | "soapMock", id: string, name: string) => {
    const cfg = loadConfig();
    const arr = kind === "mock" ? (cfg.mockFolders ?? [])
      : kind === "ws" ? (cfg.wsFolders ?? [])
        : kind === "webhook" ? (cfg.webhookFolders ?? [])
          : kind === "rule" ? (cfg.ruleFolders ?? [])
            : kind === "graphqlRequest" ? ((cfg as any).graphqlRequestFolders ?? [])
              : kind === "graphqlMock" ? ((cfg as any).graphqlMockFolders ?? [])
                : kind === "grpcRequest" ? ((cfg as any).grpcRequestFolders ?? [])
                  : kind === "grpcMock" ? ((cfg as any).grpcMockFolders ?? [])
                    : kind === "soapRequest" ? ((cfg as any).soapRequestFolders ?? [])
                      : kind === "soapMock" ? ((cfg as any).soapMockFolders ?? [])
                        : (cfg.requestFolders ?? []);
    const f = arr.find((x: Folder) => x.id === id);
    const oldName = f?.name;
    if (f) f.name = name;
    if (kind === "mock") cfg.mockFolders = arr;
    else if (kind === "ws") cfg.wsFolders = arr;
    else if (kind === "webhook") cfg.webhookFolders = arr;
    else if (kind === "rule") cfg.ruleFolders = arr;
    else if (kind === "graphqlRequest") (cfg as any).graphqlRequestFolders = arr;
    else if (kind === "graphqlMock") (cfg as any).graphqlMockFolders = arr;
    else if (kind === "grpcRequest") (cfg as any).grpcRequestFolders = arr;
    else if (kind === "grpcMock") (cfg as any).grpcMockFolders = arr;
    else if (kind === "soapRequest") (cfg as any).soapRequestFolders = arr;
    else if (kind === "soapMock") (cfg as any).soapMockFolders = arr;
    else cfg.requestFolders = arr;
    saveConfig(cfg);
    if (f && oldName) {
      const kindMap = { mock: "mocks", request: "requests", ws: "sockets", webhook: "webhooks", rule: "rules", graphqlRequest: "graphqlRequests", graphqlMock: "graphqlMocks", grpcRequest: "grpcRequests", grpcMock: "grpcMocks", soapRequest: "soapRequests", soapMock: "soapMocks" } as const;
      const fsKind = kindMap[kind];
      // Rename the physical directory if it exists
      const base = path.join(workspaceDir(f.workspaceId), fsKind);
      const oldDir = path.join(base, sanitizeDirName(oldName));
      const newDir = path.join(base, sanitizeDirName(name));
      if (fs.existsSync(oldDir) && oldDir !== newDir) {
        try {
          fs.renameSync(oldDir, newDir);
        } catch (renameErr) {
          // On Windows, renameSync fails with EPERM when any file inside is briefly locked.
          // Fall back to recursive copy + delete so the rename always succeeds.
          try {
            fs.cpSync(oldDir, newDir, { recursive: true });
            fs.rmSync(oldDir, { recursive: true, force: true });
          } catch (copyErr) {
            console.warn(`[folder:rename] Could not rename directory "${oldDir}" → "${newDir}":`, (copyErr as Error).message);
          }
        }
      }
      const idx = readIndex(f.workspaceId, fsKind);
      const fi = idx.folders.find((x: Folder) => x.id === id);
      if (fi) fi.name = name;
      writeIndex(f.workspaceId, fsKind, idx);
    }
    return { ok: true };
  });

  ipcMain.handle("folder:delete", async (_e, kind: "mock" | "request" | "ws" | "webhook" | "rule" | "graphqlRequest" | "graphqlMock", id: string) => {
    const cfg = loadConfig();
    let folder: Folder | undefined;
    let affectedEntityIds: string[] = [];
    if (kind === "mock") {
      folder = (cfg.mockFolders ?? []).find((f) => f.id === id);
      affectedEntityIds = cfg.mocks.filter((m) => m.folderId === id).map((m) => m.id);
      cfg.mockFolders = (cfg.mockFolders ?? []).filter((f) => f.id !== id);
      cfg.mocks = cfg.mocks.filter((m) => m.folderId !== id);
    } else if (kind === "ws") {
      folder = (cfg.wsFolders ?? []).find((f) => f.id === id);
      affectedEntityIds = (cfg.wsConnections ?? []).filter((c) => c.folderId === id).map((c) => c.id);
      cfg.wsFolders = (cfg.wsFolders ?? []).filter((f) => f.id !== id);
      cfg.wsConnections = (cfg.wsConnections ?? []).filter((c) => c.folderId !== id);
    } else if (kind === "webhook") {
      folder = (cfg.webhookFolders ?? []).find((f) => f.id === id);
      affectedEntityIds = (cfg.webhooks ?? []).filter((h) => h.folderId === id).map((h) => h.id);
      cfg.webhookFolders = (cfg.webhookFolders ?? []).filter((f) => f.id !== id);
      cfg.webhooks = (cfg.webhooks ?? []).filter((h) => h.folderId !== id);
    } else if (kind === "rule") {
      folder = (cfg.ruleFolders ?? []).find((f) => f.id === id);
      affectedEntityIds = (cfg.proxyRules ?? []).filter((r) => r.folderId === id).map((r) => r.id);
      cfg.ruleFolders = (cfg.ruleFolders ?? []).filter((f) => f.id !== id);
      cfg.proxyRules = (cfg.proxyRules ?? []).filter((r) => r.folderId !== id);
    } else if (kind === "graphqlRequest") {
      const gqlReqFolders: Folder[] = (cfg as any).graphqlRequestFolders ?? [];
      folder = gqlReqFolders.find((f) => f.id === id);
      affectedEntityIds = ((cfg as any).graphqlRequests ?? []).filter((r: any) => r.folderId === id).map((r: any) => r.id);
      (cfg as any).graphqlRequestFolders = gqlReqFolders.filter((f: Folder) => f.id !== id);
      (cfg as any).graphqlRequests = ((cfg as any).graphqlRequests ?? []).filter((r: any) => r.folderId !== id);
    } else if (kind === "graphqlMock") {
      const gqlMockFolders: Folder[] = (cfg as any).graphqlMockFolders ?? [];
      folder = gqlMockFolders.find((f) => f.id === id);
      affectedEntityIds = ((cfg as any).graphqlMocks ?? []).filter((m: any) => m.folderId === id).map((m: any) => m.id);
      (cfg as any).graphqlMockFolders = gqlMockFolders.filter((f: Folder) => f.id !== id);
      (cfg as any).graphqlMocks = ((cfg as any).graphqlMocks ?? []).filter((m: any) => m.folderId !== id);
    } else {
      folder = (cfg.requestFolders ?? []).find((f) => f.id === id);
      affectedEntityIds = (cfg.requests ?? []).filter((r) => r.folderId === id).map((r) => r.id);
      cfg.requestFolders = (cfg.requestFolders ?? []).filter((f) => f.id !== id);
      cfg.requests = (cfg.requests ?? []).filter((r) => r.folderId !== id);
    }
    saveConfig(cfg);
    if (folder) {
      const kindMap = { mock: "mocks", request: "requests", ws: "sockets", webhook: "webhooks", rule: "rules", graphqlRequest: "graphqlRequests", graphqlMock: "graphqlMocks" } as const;
      const fsKind = kindMap[kind];
      const wsId = folder.workspaceId;
      // Delete the physical folder directory (and all entity JSON files inside it) in one shot
      deleteEntityDir(wsId, fsKind, folder.name);
      // For requests: also clean up the runner config directory
      if (kind === "request") {
        const runnerDir = path.join(workspaceDir(wsId), "requests", ".runs", id);
        if (fs.existsSync(runnerDir)) fs.rmSync(runnerDir, { recursive: true, force: true });
      }
      // Update the index: remove the folder entry and all affected entity IDs from order
      const idx = readIndex(wsId, fsKind);
      idx.folders = idx.folders.filter((f) => f.id !== id);
      const deletedSet = new Set(affectedEntityIds);
      idx.order = (idx.order ?? []).filter((eid) => !deletedSet.has(eid));
      writeIndex(wsId, fsKind, idx);
    }
    return { ok: true };
  });

  // ── Environments ───────────────────────────────────────────────────────────

  ipcMain.handle("env:add", async (_e, env: Omit<Environment, "id" | "createdAt">) => {
    const cfg = loadConfig();
    const wsId = env.workspaceId ?? cfg.activeWorkspaceId;
    const gate = gateCreate(wsId, "environment");
    if (!gate.allowed) return { error: "limit_reached", ...gate };
    const newEnv: Environment = { ...env, id: generateId(), createdAt: Date.now(), workspaceId: wsId };
    cfg.environments = cfg.environments ?? [];
    cfg.environments.push(newEnv);
    saveConfig(cfg);
    writeFlatEntity(wsId, "environments", newEnv.id, newEnv);
    return newEnv;
  });

  ipcMain.handle("env:update", async (_e, env: Environment) => {
    const cfg = loadConfig();
    const wsId = env.workspaceId ?? cfg.activeWorkspaceId;
    cfg.environments = cfg.environments ?? [];
    const idx = cfg.environments.findIndex((e) => e.id === env.id);
    if (idx !== -1) cfg.environments[idx] = env;
    saveConfig(cfg);
    reloadConfig();
    writeFlatEntity(wsId, "environments", env.id, env);
    return { ok: true };
  });

  ipcMain.handle("env:delete", async (_e, id: string) => {
    const cfg = loadConfig();
    const env = (cfg.environments ?? []).find((e) => e.id === id);
    cfg.environments = (cfg.environments ?? []).filter((e) => e.id !== id);
    if (cfg.activeEnvironmentId === id) cfg.activeEnvironmentId = null;
    saveConfig(cfg);
    reloadConfig();
    if (env) {
      deleteFlatEntityFile(env.workspaceId, "environments", id);
    }
    return { ok: true };
  });

  ipcMain.handle("env:setActive", (_e, id: string | null) => {
    const cfg = loadConfig();
    cfg.activeEnvironmentId = id;
    const ws = (cfg.workspaces ?? []).find((w) => w.id === cfg.activeWorkspaceId);
    if (ws) ws.activeEnvironmentId = id;
    saveConfig(cfg);
    reloadConfig();
    return { ok: true };
  });

  // ── Script executor ────────────────────────────────────────────────────────

  ipcMain.handle("script:execute", (_e, opts: IpcScriptOpts) => {
    return executeIpcScript(opts);
  });

  // ── Workspaces ─────────────────────────────────────────────────────────────

  ipcMain.handle("workspace:add", async (_e, name: string) => {
    const cfg = loadConfig();
    const gate = gateCreate(cfg.activeWorkspaceId, "workspace");
    if (!gate.allowed) return { error: "limit_reached", ...gate };
    const finalName = name.trim() || generateRandomWorkspaceName();
    const newWs: Workspace = { id: generateId(), name: finalName, createdAt: Date.now(), activeEnvironmentId: null };
    cfg.workspaces = cfg.workspaces ?? [];
    cfg.workspaces.push(newWs);
    saveConfig(cfg);
    // Initialize workspace directory and git repo
    try {
      initWorkspaceDir(newWs.id, newWs.name);
      await initWorkspaceRepo(newWs.id);
    } catch { }
    return newWs;
  });

  ipcMain.handle("workspace:rename", async (_e, id: string, name: string) => {
    const cfg = loadConfig();
    const ws = (cfg.workspaces ?? []).find((w) => w.id === id);
    if (ws) ws.name = name.trim() || ws.name;
    saveConfig(cfg);
    return { ok: true };
  });

  ipcMain.handle("workspace:delete", async (_e, id: string) => {
    const cfg = loadConfig();
    const ws = (cfg.workspaces ?? []).find((w) => w.id === id);
    cfg.workspaces = (cfg.workspaces ?? []).filter((w) => w.id !== id);
    if (cfg.activeWorkspaceId === id) {
      const first = cfg.workspaces[0];
      if (first) {
        cfg.activeWorkspaceId = first.id;
        cfg.activeEnvironmentId = first.activeEnvironmentId;
      }
    }
    saveConfig(cfg);
    reloadConfig();
    return { ok: true };
  });

  ipcMain.handle("workspace:setActive", (_e, id: string) => {
    const cfg = loadConfig();
    const ws = (cfg.workspaces ?? []).find((w) => w.id === id);
    if (!ws) return { ok: false };
    cfg.activeWorkspaceId = id;
    cfg.activeEnvironmentId = ws.activeEnvironmentId;
    // saveConfig with the mutated cfg — the workspaceId guard in saveConfig ensures
    // no old-ws entities are written to the new workspace dir
    saveConfig(cfg);
    reloadConfig();
    // Return freshly loaded config from the new workspace
    return { ok: true, config: loadConfig() };
  });

  // ── Sync ──────────────────────────────────────────────────────────────────

  ipcMain.handle("sync:setRemote", async (_e, wsId: string, remote: string, branch: string) => {
    const result = await setRemote(wsId, remote, branch);
    if (result.ok) reloadConfig();
    return result;  // adoptedId is passed through to renderer
  });

  ipcMain.handle("sync:disconnect", (_e, wsId: string) => disconnect(wsId));

  ipcMain.handle("sync:push", (_e, wsId: string) => syncPush(wsId));

  ipcMain.handle("sync:pull", async (_e, wsId: string) => {
    const result = await syncPull(wsId);
    if (result.ok && result.updated) {
      reloadConfig();
      invalidateCache(wsId);
      broadcastEntityStatus(wsId);
    }
    return result;
  });

  ipcMain.handle("sync:getState", (_e, wsId: string) => getSyncState(wsId));

  ipcMain.handle("sync:setAutoSync", async (_e, wsId: string, enabled: boolean) => {
    const result = await setAutoSync(wsId, enabled);
    if (enabled) startAutoSync(wsId);
    else stopAutoSync(wsId);
    return result;
  });

  // ── Publish ───────────────────────────────────────────────────────────────

  function broadcastEntityStatus(wsId: string): void {
    getWorkspaceSyncStatus(wsId).then((status) => {
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) w.webContents.send("sync:entityStatus", { wsId, status });
      });
    }).catch(() => { });
  }

  ipcMain.handle("sync:getEntityStatus", (_e, wsId: string) => getWorkspaceSyncStatus(wsId));

  ipcMain.handle("entity:publish", async (_e, wsId: string, paths: string[]) => {
    const result = await publishEntities({ wsId, paths });
    if (result.ok) {
      // Clean up pending deletions for the published paths
      for (const p of paths) {
        const base = p.split(/[/\\]/).pop();
        if (base?.endsWith(".json")) {
          const id = base.slice(0, -5);
          for (const kind of ["requests", "mocks", "sockets", "webhooks"]) {
            const pending = getPendingDeletions(wsId, kind);
            if (pending.some((e) => e.id === id)) {
              removePendingDeletion(wsId, kind, id);
              removeNameEntry(wsId, kind, id);
            }
          }
        }
      }
    }
    invalidateCache(wsId);
    broadcastEntityStatus(wsId);
    // Update auto-sync poller's last-known head to prevent immediate re-pull of own commits
    try {
      const sha = await getRemoteHead(wsId);
      if (sha) updateLastKnownHead(wsId, sha);
    } catch { }
    return result;
  });

  ipcMain.handle("folder:publish", async (_e, wsId: string, kind: string, folderName: string | null) => {
    const folderPath = folderName ? `${kind}/${sanitizeDirName(folderName)}/` : `${kind}/`;
    const result = await publishEntities({ wsId, paths: [folderPath] });
    if (result.ok) {
      // Clear pending deletions covered by this folder publish
      const pending = getPendingDeletions(wsId, kind);
      if (folderName) {
        const cfg = loadConfig();
        const allFolders = [...(cfg.requestFolders ?? []), ...(cfg.mockFolders ?? []), ...(cfg.wsFolders ?? []), ...(cfg.webhookFolders ?? [])];
        const folder = allFolders.find((f) => f.name === folderName);
        for (const p of pending) {
          if (!folder || p.folderId === folder.id) {
            removePendingDeletion(wsId, kind, p.id);
            removeNameEntry(wsId, kind, p.id);
          }
        }
      } else {
        for (const p of pending) removeNameEntry(wsId, kind, p.id);
        clearPendingDeletions(wsId, kind);
      }
    }
    invalidateCache(wsId);
    broadcastEntityStatus(wsId);
    return result;
  });

  ipcMain.handle("entity:restore", async (_e, wsId: string, relPath: string) => {
    const base = relPath.split(/[/\\]/).pop();
    const entityId = base?.endsWith(".json") ? base.slice(0, -5) : null;

    const result = await restoreEntity(wsId, relPath);
    if (entityId) {
      for (const kind of ["requests", "mocks", "sockets", "webhooks"]) {
        const pending = getPendingDeletions(wsId, kind);
        if (pending.some((e) => e.id === entityId)) {
          removePendingDeletion(wsId, kind, entityId);
          if (!result.ok) {
            removeNameEntry(wsId, kind, entityId);
          }
        }
      }
      if (result.ok && relPath.startsWith("mocks/")) {
        reloadConfig();
      }
    }
    invalidateCache(wsId);
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  // ── Audit Log ──────────────────────────────────────────────────────────────

  ipcMain.handle("audit:list", async (_e, opts: Omit<QueryLogOptions, "workspaceId"> & { workspaceId?: string } = {}) => {
    if (!opts.workspaceId) {
      const cfg = loadConfig();
      opts = { ...opts, workspaceId: cfg.activeWorkspaceId };
    }
    return queryLog(opts as QueryLogOptions);
  });

  ipcMain.handle("audit:diff", async (_e, commitHash: string, _entity: AuditEntity, entityId: string, workspaceId: string) => {
    // Resolve the actual file path from the commit's changed files list
    const changed = await getCommitChangedFiles(commitHash, workspaceId);
    const relPath = changed.find((f) => f.includes(entityId)) ?? changed[0] ?? "";
    if (!relPath) return { before: null, after: null };
    const after = await getEntityAtCommit(commitHash, workspaceId, relPath);
    const before = await getEntityAtCommit(`${commitHash}~1`, workspaceId, relPath);
    return { before, after };
  });

  ipcMain.handle("history:list", async (_e, opts: { workspaceId?: string; filePath: string; limit?: number; offset?: number }) => {
    const wsId = opts.workspaceId ?? loadConfig().activeWorkspaceId;
    return queryLog({ workspaceId: wsId, filePath: opts.filePath, limit: opts.limit ?? 100, offset: opts.offset ?? 0 });
  });

  ipcMain.handle("history:diff", async (_e, commitHash: string, filePath: string, workspaceId: string) => {
    const after = await getEntityAtCommit(commitHash, workspaceId, filePath);
    const before = await getEntityAtCommit(`${commitHash}~1`, workspaceId, filePath);
    return { before, after };
  });

  ipcMain.handle("audit:export", async (_e, format: "json" | "csv") => {
    const cfg = loadConfig();
    const { entries } = await queryLog({ workspaceId: cfg.activeWorkspaceId, limit: 0 });
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Export Audit Log",
      defaultPath: `audit-log.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (canceled || !filePath) return { ok: false };

    if (format === "json") {
      fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf-8");
    } else {
      const header = "commitHash,ts,action,entity,entityId,entityName,workspaceId,actor";
      const rows = entries.map((e) =>
        [
          e.commitHash, e.ts, e.action, e.entity, e.entityId,
          `"${e.entityName.replace(/"/g, '""')}"`,
          e.workspaceId, e.actor,
        ].join(",")
      );
      fs.writeFileSync(filePath, [header, ...rows].join("\n"), "utf-8");
    }
    return { ok: true };
  });

  // ── Replay ─────────────────────────────────────────────────────────────────

  ipcMain.handle("request:replay",
    (_e, method: string, url: string, headers: Record<string, string>, bodyBase64: string) =>
      replayRequest(method, url, headers, bodyBase64)
  );

  ipcMain.handle("server:status", () => ({ running: isRunning(), port: getPort(), error: getServerError() }));
  ipcMain.handle("proxy:status", () => ({ running: isRunning() }));

  ipcMain.handle("server:restart", () => {
    const cfg = loadConfig();
    stopServer();
    startServer(cfg.port);
    return { ok: true };
  });

  ipcMain.handle("shell:openExternal", (_e, url: string) => {
    const { shell } = require("electron");
    shell.openExternal(url);
  });

  // ── File picker for binary body uploads ────────────────────────────────
  ipcMain.handle("dialog:openFile", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { filePaths, canceled } = await dialog.showOpenDialog(win!, {
      title: "Select File",
      properties: ["openFile"],
    });
    if (canceled || !filePaths[0]) return null;
    const filePath = filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) {
      return { error: "File exceeds 1 MB limit" };
    }
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
      webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon", bmp: "image/bmp",
      pdf: "application/pdf", zip: "application/zip", gz: "application/gzip",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
      mp4: "video/mp4", webm: "video/webm",
      woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    };
    return {
      name: path.basename(filePath),
      size: stat.size,
      base64: buffer.toString("base64"),
      mimeType: mimeMap[ext] ?? "application/octet-stream",
    };
  });

  ipcMain.handle("server:stop", () => {
    stopServer();
    return { ok: true };
  });

  ipcMain.handle("server:start", () => {
    const cfg = loadConfig();
    startServer(cfg.port);
    return { ok: true };
  });

  ipcMain.handle("shell:setTitleBarOverlay", (_e, color: string, symbolColor: string) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.setTitleBarOverlay({ color, symbolColor, height: 35 });
    }
    return { ok: true };
  });

  // ── Health Bar ─────────────────────────────────────────────────────────────

  ipcMain.handle("healthbar:getServices", (_e, wsId: string) => {
    const dir = path.join(workspaceDir(wsId), "healthbar");
    const file = path.join(dir, "services.json");
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      return [];
    }
  });

  ipcMain.handle("healthbar:saveServices", (_e, wsId: string, services: unknown[]) => {
    const dir = path.join(workspaceDir(wsId), "healthbar");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "services.json");
    fs.writeFileSync(file, JSON.stringify(services, null, 2), "utf-8");
    invalidateCache(wsId);
    broadcastEntityStatus(wsId);
    return { ok: true };
  });

  ipcMain.handle("healthbar:checkUrl", async (_e, url: string) => {
    const start = Date.now();
    return new Promise<{
      ok: boolean;
      statusCode: number | null;
      body: string | null;
      headers: Record<string, string> | null;
      error: string | null;
      durationMs: number;
    }>((resolve) => {
      try {
        const parsedUrl = new URL(url);
        const mod: typeof import("https") = parsedUrl.protocol === "https:"
          ? require("https")
          : require("http");
        const req = (mod as any).get(
          url,
          { timeout: 10000, rejectUnauthorized: false },
          (res: any) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              const rawBody = Buffer.concat(chunks).toString("utf-8");
              resolve({
                ok: true,
                statusCode: res.statusCode as number,
                body: rawBody.slice(0, 10000),
                headers: res.headers as Record<string, string>,
                error: null,
                durationMs: Date.now() - start,
              });
            });
            res.on("error", (err: Error) => {
              resolve({ ok: false, statusCode: null, body: null, headers: null, error: err.message, durationMs: Date.now() - start });
            });
          }
        );
        req.on("error", (err: Error) => {
          resolve({ ok: false, statusCode: null, body: null, headers: null, error: err.message, durationMs: Date.now() - start });
        });
        req.on("timeout", () => {
          req.destroy();
          resolve({ ok: false, statusCode: null, body: null, headers: null, error: "Request timed out", durationMs: Date.now() - start });
        });
      } catch (err: any) {
        resolve({ ok: false, statusCode: null, body: null, headers: null, error: err?.message ?? "Invalid URL", durationMs: Date.now() - start });
      }
    });
  });

  // ── Collection Runner Report Persistence ────────────────────────────────────

  ipcMain.handle("runner:saveReport", (_e, wsId: string, report: any) => {
    try {
      const folderId = report.folderId as string;
      const ts = report.startedAt as number;
      const runDir = path.join(workspaceDir(wsId), "requests", ".runs", folderId, String(ts));
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2), "utf-8");

      // Generate HTML report
      const html = generateRunnerHtml(report);
      fs.writeFileSync(path.join(runDir, "report.html"), html, "utf-8");
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "Failed to save report" };
    }
  });

  ipcMain.handle("runner:exportReport", async (_e, report: any) => {
    try {
      const folderName = (report.folderName as string) ?? "collection";
      const ts = new Date(report.startedAt as number).toISOString().replace(/[:.]/g, "-");
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: "Export Runner Report",
        defaultPath: `${folderName}-report-${ts}.html`,
        filters: [
          { name: "HTML Report", extensions: ["html"] },
          { name: "JSON Report", extensions: ["json"] },
        ],
      });
      if (canceled || !filePath) return { ok: false };
      const content = filePath.endsWith(".json")
        ? JSON.stringify(report, null, 2)
        : generateRunnerHtml(report);
      fs.writeFileSync(filePath, content, "utf-8");
      return { ok: true, filePath };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  });

  ipcMain.handle("runner:getHistory", (_e, wsId: string, folderId: string) => {
    try {
      const runsDir = path.join(workspaceDir(wsId), "requests", ".runs", folderId);
      if (!fs.existsSync(runsDir)) return [];
      const entries = fs.readdirSync(runsDir).filter((d) => {
        return fs.statSync(path.join(runsDir, d)).isDirectory();
      });
      return entries.map((ts) => {
        const reportFile = path.join(runsDir, ts, "report.json");
        if (!fs.existsSync(reportFile)) return null;
        try {
          const data = JSON.parse(fs.readFileSync(reportFile, "utf-8"));
          return {
            timestamp: Number(ts),
            summary: {
              total: data.totalTests ?? 0,
              passed: data.passedTests ?? 0,
              failed: data.failedTests ?? 0,
            },
          };
        } catch { return null; }
      }).filter(Boolean).sort((a: any, b: any) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  });

  ipcMain.handle("runner:saveConfig", (_e, wsId: string, folderId: string, config: any) => {
    try {
      const runsDir = path.join(workspaceDir(wsId), "requests", ".runs", folderId);
      fs.mkdirSync(runsDir, { recursive: true });
      fs.writeFileSync(path.join(runsDir, "runner.json"), JSON.stringify(config, null, 2), "utf-8");
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle("runner:loadConfig", (_e, wsId: string, folderId: string) => {
    try {
      const file = path.join(workspaceDir(wsId), "requests", ".runs", folderId, "runner.json");
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      return null;
    }
  });

  ipcMain.handle("runner:listFolderIds", (_e, wsId: string) => {
    try {
      const runsDir = path.join(workspaceDir(wsId), "requests", ".runs");
      if (!fs.existsSync(runsDir)) return [];
      return fs.readdirSync(runsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(runsDir, e.name, "runner.json")))
        .map((e) => e.name);
    } catch {
      return [];
    }
  });
}

function generateRunnerHtml(report: any): string {
  const duration = ((report.completedAt - report.startedAt) / 1000).toFixed(2);
  const timestamp = new Date(report.startedAt).toISOString();
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Run Report - ${esc(report.folderName)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 24px; }
.header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #333; }
.header h1 { font-size: 20px; color: #fff; margin-bottom: 8px; }
.meta { font-size: 12px; color: #888; }
.summary { display: flex; gap: 24px; margin-bottom: 24px; padding: 16px; background: #222; border-radius: 8px; }
.stat { text-align: center; }
.stat .value { font-size: 24px; font-weight: bold; }
.stat .label { font-size: 11px; color: #888; text-transform: uppercase; }
.passed { color: #4caf50; }
.failed { color: #f44336; }
.request { margin-bottom: 12px; border: 1px solid #333; border-radius: 6px; overflow: hidden; }
.req-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #252535; }
.method { font-size: 11px; font-weight: bold; color: #64b5f6; font-family: monospace; }
.name { font-size: 13px; flex: 1; }
.status { font-weight: bold; font-family: monospace; }
.time { font-size: 11px; color: #888; }
.tests { padding: 8px 12px; }
.test-item { display: flex; gap: 8px; padding: 4px 0; font-size: 12px; font-family: monospace; }
</style>
</head>
<body>
<div class="header">
<h1>Collection Run: ${esc(report.folderName)}</h1>
<div class="meta">${timestamp} &bull; Duration: ${duration}s</div>
</div>
<div class="summary">
<div class="stat"><div class="value">${report.totalRequests}</div><div class="label">Requests</div></div>
<div class="stat"><div class="value passed">${report.passedTests}</div><div class="label">Passed</div></div>
<div class="stat"><div class="value failed">${report.failedTests}</div><div class="label">Failed</div></div>
<div class="stat"><div class="value">${duration}s</div><div class="label">Duration</div></div>
</div>
${(report.results ?? []).map((r: any, i: number) => `
<div class="request">
<div class="req-header">
<span class="method">${r.method}</span>
<span class="name">${esc(r.requestName)}</span>
${r.status != null ? `<span class="status">${r.status}</span>` : ""}
<span class="time">${r.responseTime}ms</span>
</div>
${(r.tests?.length || r.error) ? `<div class="tests">
${r.error ? `<div class="test-item failed">✗ Error: ${esc(r.error)}</div>` : ""}
${(r.tests ?? []).map((t: any) => `<div class="test-item ${t.passed ? "passed" : "failed"}">${t.passed ? "✓" : "✗"} ${esc(t.name)}${t.error ? ` — ${esc(t.error)}` : ""}</div>`).join("")}
</div>` : ""}
</div>`).join("")}
</body>
</html>`;
}
