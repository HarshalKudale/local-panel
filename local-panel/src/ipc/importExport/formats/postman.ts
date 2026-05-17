/**
 * Postman Collection v2.1 format helpers — pure conversion logic, no I/O.
 * Used by both exporters and importers.
 */

import { Folder, MockRule, SavedRequest } from "@/store/config";

// ── Postman v2.1 type stubs ────────────────────────────────────────────────

export interface PMHeader  { key: string; value: string; type?: string; disabled?: boolean }
export interface PMUrl     { raw: string }
export interface PMBody {
  mode: string;
  raw?: string;
  urlencoded?: Array<{ key: string; value: string; disabled?: boolean }>;
  formdata?: Array<{ key: string; value: string; type?: string; disabled?: boolean }>;
  graphql?: { query?: string; variables?: string };
}
export interface PMEvent {
  listen: string;
  script?: { type?: string; exec?: string[] };
}

export interface PMRequest {
  method: string;
  header: PMHeader[] | string;
  body?: PMBody;
  url: PMUrl | string;
}

export interface PMResponse {
  name:            string;
  originalRequest?: PMRequest;
  status?:         string;
  code?:           number;
  header?:         PMHeader[] | string;
  body?:           string;
}

export interface PMItem {
  name:      string;
  item?:     PMItem[];
  request?:  PMRequest;
  response?: PMResponse[];
  event?:    PMEvent[];
  _localpanel?: {
    urlPattern: string;
    useRegex:   boolean;
    enabled:    boolean;
  };
}

export interface PMCollection {
  info: {
    name:         string;
    _postman_id?: string;
    schema:       string;
    description?: string;
  };
  item: PMItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function mkId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function urlRaw(u: PMUrl | string): string {
  return typeof u === "string" ? u : (u.raw ?? "");
}

export function hToRecord(hs: PMHeader[] | string | undefined): Record<string, string> {
  if (!hs || typeof hs === "string") return {};
  const out: Record<string, string> = {};
  for (const h of hs) if (!h.disabled && h.key) out[h.key] = h.value ?? "";
  return out;
}

export function bodyToText(body: PMBody | undefined): string {
  if (!body) return "";
  if (body.mode === "raw") return body.raw ?? "";
  if (body.mode === "urlencoded" && Array.isArray(body.urlencoded)) {
    return body.urlencoded
      .filter((p) => !p.disabled && p.key)
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? "")}`)
      .join("&");
  }
  if (body.mode === "formdata" && Array.isArray(body.formdata)) {
    return body.formdata
      .filter((p) => !p.disabled && p.key)
      .map((p) => `${p.key}: ${p.value ?? ""}`)
      .join("\n");
  }
  if (body.mode === "graphql" && body.graphql) {
    const parts: Record<string, string | undefined> = {};
    if (body.graphql.query) parts.query = body.graphql.query;
    if (body.graphql.variables) parts.variables = body.graphql.variables;
    return JSON.stringify(parts, null, 2);
  }
  return "";
}

export function eventsToScripts(events: PMEvent[] | undefined): { preScript: string; postScript: string } {
  let preScript = "";
  let postScript = "";
  if (!events) return { preScript, postScript };
  for (const ev of events) {
    const src = ev.script?.exec?.join("\n") ?? "";
    if (ev.listen === "prerequest") preScript = src;
    else if (ev.listen === "test") postScript = src;
  }
  return { preScript, postScript };
}

export function recordToH(r: Record<string, string>): PMHeader[] {
  return Object.entries(r).map(([key, value]) => ({ key, value, type: "text" }));
}

export function b64Decode(b64: string): string {
  if (!b64) return "";
  try {
    return Buffer.from(b64, "base64").toString("utf-8");
  } catch { return ""; }
}

export function b64Encode(text: string): string {
  if (!text.trim()) return "";
  try {
    return Buffer.from(text, "utf-8").toString("base64");
  } catch { return ""; }
}

export function statusText(code: number): string {
  const m: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 409: "Conflict",
    422: "Unprocessable Entity", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
  };
  return m[code] ?? "Unknown";
}

// ── Folder-tree builder ────────────────────────────────────────────────────

export interface FNode<T> {
  folder: Folder | null;
  children: FNode<T>[];
  items: T[];
}

export function buildFolderTree<T extends { folderId?: string | null }>(
  folders: Folder[],
  items: T[],
): FNode<T> {
  const nodeMap = new Map<string | null, FNode<T>>();
  nodeMap.set(null, { folder: null, children: [], items: [] });
  for (const f of folders) nodeMap.set(f.id, { folder: f, children: [], items: [] });
  for (const f of folders) {
    const parent = nodeMap.get(f.parentId ?? null) ?? nodeMap.get(null)!;
    parent.children.push(nodeMap.get(f.id)!);
  }
  for (const item of items) {
    const node = nodeMap.get(item.folderId ?? null) ?? nodeMap.get(null)!;
    node.items.push(item);
  }
  return nodeMap.get(null)!;
}

// ── REQUESTS: export ───────────────────────────────────────────────────────

function scriptsToEvents(preScript?: string, postScript?: string): PMEvent[] {
  const events: PMEvent[] = [];
  if (preScript?.trim()) events.push({ listen: "prerequest", script: { type: "text/javascript", exec: preScript.split("\n") } });
  if (postScript?.trim()) events.push({ listen: "test", script: { type: "text/javascript", exec: postScript.split("\n") } });
  return events;
}

function reqToItem(r: SavedRequest): PMItem {
  const item: PMItem = {
    name: r.name || `${r.method} ${r.url}`,
    request: {
      method: r.method,
      header: recordToH(r.headers ?? {}),
      url: { raw: r.url },
    },
    response: [],
  };
  if (r.body?.trim()) item.request!.body = { mode: "raw", raw: r.body };
  const events = scriptsToEvents(r.preScript, r.postScript);
  if (events.length) item.event = events;
  return item;
}

function folderNodeToItems(node: FNode<SavedRequest>): PMItem[] {
  return [
    ...node.items.map(reqToItem),
    ...node.children.map((child): PMItem => ({
      name: child.folder!.name,
      item: folderNodeToItems(child),
    })),
  ];
}

export function exportRequestsToPostman(
  requests: SavedRequest[],
  folders: Folder[],
  name = "Local Panel Requests",
): string {
  const root = buildFolderTree(folders, requests);
  const col: PMCollection = {
    info: {
      name,
      _postman_id: mkId(),
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: folderNodeToItems(root),
  };
  return JSON.stringify(col, null, 2);
}

// ── MOCKS: export ──────────────────────────────────────────────────────────

function mockToItem(m: MockRule): PMItem {
  const pmReq: PMRequest = {
    method: m.method === "*" ? "GET" : m.method,
    header: [],
    url: { raw: m.urlPattern },
  };
  const capturedBodyText = b64Decode(m.capturedBody ?? "");
  if (capturedBodyText.trim()) pmReq.body = { mode: "raw", raw: capturedBodyText };

  const pmRes: PMResponse = {
    name: m.name || `${m.method} ${m.urlPattern}`,
    originalRequest: pmReq,
    status: statusText(m.responseStatus),
    code: m.responseStatus,
    header: recordToH(m.responseHeaders ?? {}),
    body: m.responseBody,
  };

  return {
    name: m.name || `${m.method === "*" ? "ANY" : m.method} ${m.urlPattern}`,
    request: pmReq,
    response: [pmRes],
    _localpanel: {
      urlPattern: m.urlPattern,
      useRegex:   m.useRegex,
      enabled:    m.enabled,
    },
  };
}

function mockFolderNodeToItems(node: FNode<MockRule>): PMItem[] {
  return [
    ...node.items.map(mockToItem),
    ...node.children.map((child): PMItem => ({
      name: child.folder!.name,
      item: mockFolderNodeToItems(child),
    })),
  ];
}

export function exportMocksToPostman(
  mocks: MockRule[],
  folders: Folder[],
  name = "Local Panel Mocks",
): string {
  const root = buildFolderTree(folders, mocks);
  const col: PMCollection = {
    info: {
      name,
      _postman_id: mkId(),
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      description: "Local Panel mock rules. Each item's response[0] contains the mock response. _localpanel extension preserves regex/enabled state.",
    },
    item: mockFolderNodeToItems(root),
  };
  return JSON.stringify(col, null, 2);
}

// ── REQUESTS: import helpers (shared with importer) ───────────────────────

export interface ImportRequestItem {
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  preScript?: string;
  postScript?: string;
  folderId: string | null;
}

export interface ImportFolderItem {
  name: string;
  parentId: string | null;
}

export interface ParsedPostmanRequests {
  folders: ImportFolderItem[];
  requests: ImportRequestItem[];
}

export function parsePostmanRequests(jsonText: string): ParsedPostmanRequests {
  const col = JSON.parse(jsonText) as PMCollection;
  if (!col?.info?.schema?.includes("collection")) throw new Error("Not a Postman collection");

  const folders: ImportFolderItem[] = [];
  const requests: ImportRequestItem[] = [];

  function walk(items: PMItem[], parentName: string | null) {
    for (const item of items) {
      if (Array.isArray(item.item)) {
        folders.push({ name: item.name, parentId: parentName });
        walk(item.item, item.name);
      } else if (item.request) {
        const req = item.request;
        const { preScript, postScript } = eventsToScripts(item.event);
        requests.push({
          name: item.name,
          method: req.method?.toUpperCase() ?? "GET",
          url: urlRaw(req.url),
          headers: hToRecord(req.header),
          body: bodyToText(req.body),
          ...(preScript ? { preScript } : {}),
          ...(postScript ? { postScript } : {}),
          folderId: parentName,
        });
      }
    }
  }

  walk(col.item ?? [], null);
  return { folders, requests };
}

// ── MOCKS: import helpers ─────────────────────────────────────────────────

export interface ImportMockItem {
  name: string;
  method: string;
  urlPattern: string;
  useRegex: boolean;
  enabled: boolean;
  capturedHeaders: Record<string, string>;
  capturedBody: string;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  folderId: string | null;
}

export interface ParsedPostmanMocks {
  folders: ImportFolderItem[];
  mocks: ImportMockItem[];
}

export function parsePostmanMocks(jsonText: string): ParsedPostmanMocks {
  const col = JSON.parse(jsonText) as PMCollection;
  if (!col?.info?.schema?.includes("collection")) throw new Error("Not a Postman collection");

  const folders: ImportFolderItem[] = [];
  const mocks: ImportMockItem[] = [];

  function walk(items: PMItem[], parentName: string | null) {
    for (const item of items) {
      if (Array.isArray(item.item)) {
        folders.push({ name: item.name, parentId: parentName });
        walk(item.item, item.name);
      } else if (item.request) {
        const req = item.request;
        const lp = item._localpanel;
        const res = item.response?.[0];
        const urlPattern = lp?.urlPattern ?? urlRaw(req.url);
        const method = lp ? (req.method?.toUpperCase() ?? "*") : (req.method?.toUpperCase() ?? "GET");
        mocks.push({
          name: item.name,
          method: method || "*",
          urlPattern,
          useRegex: lp?.useRegex ?? false,
          enabled: lp?.enabled ?? false,
          capturedHeaders: hToRecord(req.header),
          capturedBody: b64Encode(req.body?.mode === "raw" ? (req.body.raw ?? "") : ""),
          responseStatus: res?.code ?? 200,
          responseHeaders: hToRecord(res?.header),
          responseBody: res?.body ?? "{}",
          folderId: parentName,
        });
      }
    }
  }

  walk(col.item ?? [], null);
  return { folders, mocks };
}
