import * as net from "net";
import * as http from "http";
import * as https from "https";
import { loadConfig, AppConfig, Environment, ProxyRule } from "@/store/config";
import { readEnabledSet, bootstrapEnabledSet, readAllEntities } from "@/store/workspaceFs";
import { HOP_BY_HOP } from "@/proxy/constants";
import { sendHtml, buildHomePage, buildNotMappedPage } from "@/proxy/pages";
import { resolveVars, matchMock, serveMock } from "@/proxy/mockHandler";
import { matchGraphQLMock, matchSoapMock, serveProtocolMock, GraphQLMockDef, SoapMockDef } from "@/proxy/protocolMockHandler";
import { tcpTunnel, proxyToUpstream, passthroughToUpstream, passthroughToUpstreamHttps, matchProxyRule, proxyWithScripts } from "@/proxy/proxyHandler";
import { loadCA, unloadCA, isCALoaded, clearCertCache } from "@/proxy/tlsCert";
import { interceptTls } from "@/proxy/tlsIntercept";
import { decompressBody, stripContentEncoding } from "@/proxy/decompressUtils";
import { RequestLogEntry, logEmitter, emitLog, emitLogChunk } from "@/proxy/logEmitter";

export { RequestLogEntry, logEmitter, emitLogChunk } from "@/proxy/logEmitter";

function mkId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

let server: net.Server | null = null;
let currentPort = 0;
let currentConfig: AppConfig;
let fullRules: ProxyRule[] = [];
let lastError: string | null = null;

// Per-kind enabled ID sets — loaded from enabled.json for fast dispatch
interface EnabledSets {
  mocks: Set<string>;
  mappings: Set<string>;
  rules: Set<string>;
}
let enabledSets: EnabledSets = { mocks: new Set(), mappings: new Set(), rules: new Set() };

function loadEnabledSets(wsId: string): EnabledSets {
  const load = (kind: string): Set<string> => {
    const existing = readEnabledSet(wsId, kind);
    if (existing !== null) return existing;
    // First run — bootstrap from entity files
    return bootstrapEnabledSet(wsId, kind);
  };
  return { mocks: load("mocks"), mappings: load("mappings"), rules: load("rules") };
}

export function startServer(port: number): void {
  if (server) stopServer();
  currentConfig = loadConfig();
  fullRules = readAllEntities<ProxyRule>(currentConfig.activeWorkspaceId, "rules");
  enabledSets = loadEnabledSets(currentConfig.activeWorkspaceId);
  currentPort = port;
  lastError = null;

  if (currentConfig.tlsEnabled && currentConfig.tlsCaCertPath && currentConfig.tlsCaKeyPath) {
    loadCA(currentConfig.tlsCaCertPath, currentConfig.tlsCaKeyPath);
  } else {
    unloadCA();
  }

  server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    let dispatched = false;

    socket.on("data", (chunk) => {
      if (dispatched) return;
      buf = Buffer.concat([buf, chunk]);
      const sep = buf.indexOf("\r\n\r\n");
      if (sep === -1) return;
      dispatched = true;

      const headerSection = buf.slice(0, sep).toString("utf-8");
      const bodyBuf = buf.slice(sep + 4);
      const lines = headerSection.split("\r\n");
      const parts = lines[0].split(" ");
      const method = parts[0] ?? "GET";
      const rawTarget = parts[1] ?? "/";

      if (method === "CONNECT") {
        const lastColon = rawTarget.lastIndexOf(":");
        const host = rawTarget.slice(0, lastColon);
        const tlsPort = parseInt(rawTarget.slice(lastColon + 1) || "443", 10);
        if (currentConfig.tlsEnabled && isCALoaded()) {
          interceptTls(socket, host, tlsPort, (tlsSocket, decMethod, decTarget, decHeaders, decBody, hostname, hPort) => {
            dispatchHttps(tlsSocket, decMethod, decTarget, decHeaders, decBody, hostname, hPort);
          });
        } else {
          tcpTunnel(socket, host, tlsPort, null, "HTTP/1.1 200 Connection Established\r\n\r\n");
        }
      } else {
        dispatch(socket, method, rawTarget, lines.slice(1), bodyBuf);
      }
    });

    socket.on("error", () => socket.destroy());
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EACCES") {
      lastError = `Permission denied — run as Administrator to bind port ${port}`;
      console.error(`[server:${port}]`, lastError);
    } else if (err.code === "EADDRINUSE") {
      lastError = `Port ${port} is already in use`;
      console.error(`[server:${port}]`, lastError);
    } else {
      lastError = err.message;
      console.error(`[server:${port}] error:`, err.message);
    }
    logEmitter.emit("server-error", lastError);
  });

  server.listen(port, "127.0.0.1", () => {
    lastError = null;
    console.log(`[server:${port}] listening on 127.0.0.1:${port}`);
  });
}

export function stopServer(): void {
  if (server) {
    server.close();
    server = null;
    unloadCA();
    clearCertCache();
    console.log(`[server:${currentPort}] stopped`);
  }
}

export function isRunning(): boolean {
  return server !== null && server.listening;
}

export function getPort(): number {
  return currentPort;
}

export function getServerError(): string | null {
  return lastError;
}

export function reloadConfig(): void {
  currentConfig = loadConfig();
  fullRules = readAllEntities<ProxyRule>(currentConfig.activeWorkspaceId, "rules");
  enabledSets = loadEnabledSets(currentConfig.activeWorkspaceId);
}


// ── Replay a captured request, return {status, headers, body (base64)} ────

export function replayRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  bodyBase64: string,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    let hostname: string;
    let port: number;
    let path: string;
    try {
      const u = new URL(url);
      hostname = u.hostname;
      port = u.port ? parseInt(u.port, 10) : (u.protocol === "https:" ? 443 : 80);
      path = u.pathname + u.search;
    } catch {
      return reject(new Error("Invalid URL"));
    }

    const body = bodyBase64 ? Buffer.from(bodyBase64, "base64") : Buffer.alloc(0);
    const upHeaders: Record<string, string> = { ...headers, connection: "close" };
    if (body.length > 0) upHeaders["content-length"] = String(body.length);

    const isHttps = new URL(url).protocol === "https:";
    const transport = isHttps ? https : http;
    const req = transport.request({ hostname, port, path, method, headers: upHeaders }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const resHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v != null && !HOP_BY_HOP.has(k.toLowerCase()))
            resHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
        }
        const raw = Buffer.concat(chunks);
        const ce = resHeaders["content-encoding"] ?? "";
        const decompressed = decompressBody(raw, ce);
        const logHeaders = ce ? stripContentEncoding(resHeaders) : resHeaders;
        resolve({
          status: res.statusCode ?? 0,
          headers: logHeaders,
          body: decompressed.toString("base64"),
        });
      });
    });
    req.on("error", reject);
    if (body.length > 0) req.write(body);
    req.end();
  });
}

// ── HTTP dispatch ─────────────────────────────────────────────────────────

function activeEnv(cfg: AppConfig): Environment | null {
  const globalEnv = (cfg.environments ?? []).find((e) => e.id === "__global__") ?? null;
  const selected = cfg.activeEnvironmentId
    ? (cfg.environments ?? []).find((e) => e.id === cfg.activeEnvironmentId) ?? null
    : null;
  if (!globalEnv && !selected) return null;
  const map = new Map<string, { id: string; key: string; value: string }>();
  for (const v of globalEnv?.variables ?? []) map.set(v.key, v);
  for (const v of selected?.variables ?? []) map.set(v.key, v);
  return { id: "merged", name: "merged", variables: [...map.values()], createdAt: 0, workspaceId: "" };
}

function workspaceCfg(cfg: AppConfig): AppConfig {
  const wsId = cfg.activeWorkspaceId;
  if (!wsId) return cfg;
  // Use enabled.json sets for fast O(1) lookup — only include enabled entities for proxy dispatch
  return {
    ...cfg,
    mappings: cfg.mappings.filter((m) => m.workspaceId === wsId && enabledSets.mappings.has(m.id)),
    proxyRules: fullRules.filter((r) => (!r.workspaceId || r.workspaceId === wsId) && enabledSets.rules.has(r.id)),
    mocks: cfg.mocks.filter((m) => m.workspaceId === wsId && enabledSets.mocks.has(m.id)),
  };
}

function dispatch(
  socket: net.Socket,
  method: string,
  rawTarget: string,
  headerLines: string[],
  bodyBuf: Buffer,
): void {
  const cfg = workspaceCfg(currentConfig ?? loadConfig());
  const t0 = Date.now();
  const id = mkId();

  // Parse headers, strip hop-by-hop
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    if (!HOP_BY_HOP.has(key)) headers[key] = line.slice(idx + 1).trim();
  }

  const hostHeader = (headers["host"] ?? "").toLowerCase();
  const host = hostHeader.split(":")[0];

  let reqPath = "/";
  if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
    try { const u = new URL(rawTarget); reqPath = u.pathname + u.search; } catch { reqPath = "/"; }
  } else {
    reqPath = rawTarget || "/";
  }

  const url = rawTarget.startsWith("http") ? rawTarget : `http://${hostHeader}${reqPath}`;
  const reqBodyB64 = bodyBuf.length > 0 ? bodyBuf.toString("base64") : "";

  const baseEntry: Omit<RequestLogEntry, "status" | "via" | "target" | "durationMs" | "resHeaders" | "resBody" | "resStatus"> = {
    id, ts: t0, method, url, host,
    reqHeaders: headers,
    reqBody: reqBodyB64,
  };

  // 1. localhost base → home page (no log)
  if (host === "localhost") {
    sendHtml(socket, 200, buildHomePage(cfg, currentPort));
    return;
  }

  // 2. *.localhost → mapping lookup (RFC 6761) — no mock matching here, these are internal
  if (host.endsWith(".localhost")) {
    const mapping = cfg.mappings.find((m) => m.enabled && m.domain.toLowerCase() === host);
    if (mapping) {
      proxyToUpstream(socket, method, mapping.target, reqPath, headers, bodyBuf, (status, dur, resH, resB) => {
        emitLog({ ...baseEntry, status, via: "rfc6761", target: mapping.target, durationMs: dur, resHeaders: resH, resBody: resB, resStatus: status });
      }, baseEntry.id);
    } else {
      sendHtml(socket, 404, buildNotMappedPage(host, currentPort));
      emitLog({ ...baseEntry, status: 404, via: "error", target: null, durationMs: Date.now() - t0, resHeaders: {}, resBody: "", resStatus: 404 });
    }
    return;
  }

  // 3. Forward proxy path (always active for absolute http:// targets)
  if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
    // 3a. Mock check — highest priority
    const env = activeEnv(cfg);
    const mock = matchMock(cfg.mocks, method, url, env);
    if (mock) {
      serveMock(socket, mock, env);
      const isBinary = mock.responseBodyEncoding === "base64";
      const logBody = isBinary ? mock.responseBody : Buffer.from(resolveVars(mock.responseBody, env), "utf-8").toString("base64");
      emitLog({ ...baseEntry, status: mock.responseStatus, via: "mock", target: `mock:${mock.id}`, durationMs: Date.now() - t0, resHeaders: mock.responseHeaders, resBody: logBody, resStatus: mock.responseStatus });
      return;
    }

    // 3a-ii. GraphQL mock check
    const bodyStr = bodyBuf.toString("utf-8");
    const gqlMocks = (cfg as any).graphqlMocks as GraphQLMockDef[] | undefined;
    const gqlMock = matchGraphQLMock(gqlMocks ?? [], url, bodyStr, env);
    if (gqlMock) {
      serveProtocolMock(socket, gqlMock, env);
      emitLog({ ...baseEntry, status: gqlMock.responseStatus, via: "mock", target: `graphql-mock:${gqlMock.id}`, durationMs: Date.now() - t0, resHeaders: gqlMock.responseHeaders, resBody: Buffer.from(gqlMock.responseBody, "utf-8").toString("base64"), resStatus: gqlMock.responseStatus });
      return;
    }

    // 3a-iii. SOAP mock check
    const soapMocks = (cfg as any).soapMocks as SoapMockDef[] | undefined;
    const soapMock = matchSoapMock(soapMocks ?? [], url, headers, bodyStr, env);
    if (soapMock) {
      serveProtocolMock(socket, soapMock, env);
      emitLog({ ...baseEntry, status: soapMock.responseStatus, via: "mock", target: `soap-mock:${soapMock.id}`, durationMs: Date.now() - t0, resHeaders: soapMock.responseHeaders, resBody: Buffer.from(soapMock.responseBody, "utf-8").toString("base64"), resStatus: soapMock.responseStatus });
      return;
    }

    // 3b. Proxy rule match
    const { matched, rule: matchedRule, target: ruleTarget } = matchProxyRule(cfg.proxyRules, rawTarget, cfg.mappings);
    if (matched) {
      if (matchedRule && ruleTarget) {
        const hasScripts = !!(matchedRule.requestScript?.trim() || matchedRule.responseScript?.trim());
        if (hasScripts) {
          proxyWithScripts(socket, method, ruleTarget, reqPath, headers, bodyBuf, matchedRule, (status, dur, resH, resB) => {
            emitLog({ ...baseEntry, status, via: "rule", target: ruleTarget, durationMs: dur, resHeaders: resH, resBody: resB, resStatus: status });
          });
        } else {
          proxyToUpstream(socket, method, ruleTarget, reqPath, headers, bodyBuf, (status, dur, resH, resB) => {
            emitLog({ ...baseEntry, status, via: "rule", target: ruleTarget, durationMs: dur, resHeaders: resH, resBody: resB, resStatus: status });
          }, baseEntry.id);
        }
      } else {
        sendHtml(socket, 502, "<h1>502 Bad Gateway</h1><p>Proxy rule matched but the target is not configured.</p>");
        emitLog({ ...baseEntry, status: 502, via: "error", target: null, durationMs: Date.now() - t0, resHeaders: {}, resBody: "", resStatus: 502 });
      }
      return;
    }

    // 3c. Passthrough
    passthroughToUpstream(socket, method, rawTarget, reqPath, headers, bodyBuf, (status, dur, resH, resB) => {
      emitLog({ ...baseEntry, status, via: "proxy", target: host, durationMs: dur, resHeaders: resH, resBody: resB, resStatus: status });
    }, baseEntry.id);
    return;
  }

  sendHtml(socket, 400, "<h1>400 Bad Request</h1><p>Not a localhost domain.</p>");
  emitLog({ ...baseEntry, status: 400, via: "error", target: null, durationMs: Date.now() - t0, resHeaders: {}, resBody: "", resStatus: 400 });
}

// ── HTTPS dispatch (TLS intercepted) ─────────────────────────────────────────

import type { TLSSocket } from "tls";

function dispatchHttps(
  socket: TLSSocket,
  method: string,
  rawTarget: string,  // relative path, e.g. "/api/users"
  headerLines: string[],
  bodyBuf: Buffer,
  hostname: string,
  port: number,
): void {
  const cfg = workspaceCfg(currentConfig ?? loadConfig());
  const t0 = Date.now();
  const id = mkId();

  // Parse headers, strip hop-by-hop
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    if (!HOP_BY_HOP.has(key)) headers[key] = line.slice(idx + 1).trim();
  }

  const reqPath = rawTarget || "/";
  const portSuffix = port === 443 ? "" : `:${port}`;
  const url = `https://${hostname}${portSuffix}${reqPath}`;
  const reqBodyB64 = bodyBuf.length > 0 ? bodyBuf.toString("base64") : "";

  const baseEntry: Omit<RequestLogEntry, "status" | "via" | "target" | "durationMs" | "resHeaders" | "resBody" | "resStatus"> = {
    id, ts: t0, method, url, host: hostname,
    reqHeaders: headers,
    reqBody: reqBodyB64,
  };

  // 1. Mock check — highest priority
  const env = activeEnv(cfg);
  const mock = matchMock(cfg.mocks, method, url, env);
  if (mock) {
    serveMock(socket, mock, env);
    const isBinary = mock.responseBodyEncoding === "base64";
    const logBody = isBinary ? mock.responseBody : Buffer.from(resolveVars(mock.responseBody, env), "utf-8").toString("base64");
    emitLog({ ...baseEntry, status: mock.responseStatus, via: "mock", target: `mock:${mock.id}`, durationMs: Date.now() - t0, resHeaders: mock.responseHeaders, resBody: logBody, resStatus: mock.responseStatus });
    return;
  }

  // 1b. GraphQL mock check
  const bodyStr = bodyBuf.toString("utf-8");
  const gqlMocks = (cfg as any).graphqlMocks as GraphQLMockDef[] | undefined;
  const gqlMock = matchGraphQLMock(gqlMocks ?? [], url, bodyStr, env);
  if (gqlMock) {
    serveProtocolMock(socket, gqlMock, env);
    emitLog({ ...baseEntry, status: gqlMock.responseStatus, via: "mock", target: `graphql-mock:${gqlMock.id}`, durationMs: Date.now() - t0, resHeaders: gqlMock.responseHeaders, resBody: Buffer.from(gqlMock.responseBody, "utf-8").toString("base64"), resStatus: gqlMock.responseStatus });
    return;
  }

  // 1c. SOAP mock check
  const soapMocks = (cfg as any).soapMocks as SoapMockDef[] | undefined;
  const soapMock = matchSoapMock(soapMocks ?? [], url, headers, bodyStr, env);
  if (soapMock) {
    serveProtocolMock(socket, soapMock, env);
    emitLog({ ...baseEntry, status: soapMock.responseStatus, via: "mock", target: `soap-mock:${soapMock.id}`, durationMs: Date.now() - t0, resHeaders: soapMock.responseHeaders, resBody: Buffer.from(soapMock.responseBody, "utf-8").toString("base64"), resStatus: soapMock.responseStatus });
    return;
  }

  // 2. Proxy rule match — match against the full https:// URL
  const { matched, rule: matchedRule, target: ruleTarget } = matchProxyRule(cfg.proxyRules, url, cfg.mappings);
  if (matched) {
    if (matchedRule && ruleTarget) {
      const hasScripts = !!(matchedRule.requestScript?.trim() || matchedRule.responseScript?.trim());
      if (hasScripts) {
        proxyWithScripts(socket, method, ruleTarget, reqPath, headers, bodyBuf, matchedRule, (status, dur, resH, resB) => {
          emitLog({ ...baseEntry, status, via: "rule", target: ruleTarget, durationMs: dur, resHeaders: resH, resBody: resB, resStatus: status });
        });
      } else {
        proxyToUpstream(socket, method, ruleTarget, reqPath, headers, bodyBuf, (status, dur, resH, resB) => {
          emitLog({ ...baseEntry, status, via: "rule", target: ruleTarget, durationMs: dur, resHeaders: resH, resBody: resB, resStatus: status });
        }, baseEntry.id);
      }
    } else {
      sendHtml(socket, 502, "<h1>502 Bad Gateway</h1><p>Proxy rule matched but the target is not configured.</p>");
      emitLog({ ...baseEntry, status: 502, via: "error", target: null, durationMs: Date.now() - t0, resHeaders: {}, resBody: "", resStatus: 502 });
    }
    return;
  }

  // 3. Passthrough — forward to real upstream over HTTPS
  passthroughToUpstreamHttps(socket, method, hostname, port, reqPath, headers, bodyBuf, (status, dur, resH, resB) => {
    emitLog({ ...baseEntry, status, via: "proxy", target: hostname, durationMs: dur, resHeaders: resH, resBody: resB, resStatus: status });
  }, baseEntry.id);
}
