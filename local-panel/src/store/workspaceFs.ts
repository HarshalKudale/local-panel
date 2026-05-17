import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

export interface WorkspaceFile {
  id: string;
  name: string;
  createdAt: number;
  activeEnvironmentId: string | null;
}

export interface FolderEntry {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  workspaceId: string;
}

export interface EntityIndex {
  folders: FolderEntry[];
  order: string[];
}

// ── Path helpers ──────────────────────────────────────────────────────────────

let _dataRootOverride: string | null = null;

export function setDataRootOverride(root: string | null): void {
  _dataRootOverride = root;
}

export function dataRoot(): string {
  if (_dataRootOverride) return _dataRootOverride;
  // Windows: use AppData\Local instead of Roaming
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "Local Panel", "data");
  }
  return path.join(app.getPath("userData"), "data");
}

export function wsDir(wsId: string): string {
  return path.join(dataRoot(), wsId);
}

function entityDir(wsId: string, kind: string): string {
  return path.join(wsDir(wsId), kind);
}

/** Sanitize a folder name to be safe as a filesystem directory name. */
export function sanitizeDirName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "unnamed";
}

function entityFile(wsId: string, kind: string, id: string, folderName?: string | null): string {
  const base = entityDir(wsId, kind);
  if (folderName) return path.join(base, sanitizeDirName(folderName), `${id}.json`);
  return path.join(base, `${id}.json`);
}

function indexFile(wsId: string, kind: string): string {
  return path.join(entityDir(wsId, kind), "index.json");
}

// ── Workspace init ────────────────────────────────────────────────────────────

export function initWorkspaceDir(wsId: string, name: string): void {
  const dirs = [
    wsDir(wsId),
    entityDir(wsId, "mappings"),
    entityDir(wsId, "rules"),
    entityDir(wsId, "environments"),
    entityDir(wsId, "mocks"),
    entityDir(wsId, "requests"),
    entityDir(wsId, "sockets"),
    entityDir(wsId, "capture"),
    entityDir(wsId, "webhooks"),
    entityDir(wsId, "graphqlRequests"),
    entityDir(wsId, "graphqlMocks"),
    entityDir(wsId, "soapRequests"),
    entityDir(wsId, "soapMocks"),
    entityDir(wsId, "grpcRequests"),
    entityDir(wsId, "grpcMocks"),
  ];
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });

  const wsFile = path.join(wsDir(wsId), "workspace.json");
  if (!fs.existsSync(wsFile)) {
    const wf: WorkspaceFile = { id: wsId, name, createdAt: Date.now(), activeEnvironmentId: null };
    fs.writeFileSync(wsFile, JSON.stringify(wf, null, 2), "utf-8");
  }

  const gitignore = path.join(wsDir(wsId), ".gitignore");
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, "capture/\n*.tmp\n", "utf-8");
  }
}

// ── Generic entity read/write ─────────────────────────────────────────────────

/** Remove any existing file for this entity ID across root and all sub-folders. */
function removeExistingEntityFile(wsId: string, kind: string, id: string): void {
  const dir = entityDir(wsId, kind);
  if (!fs.existsSync(dir)) return;
  const rootFile = path.join(dir, `${id}.json`);
  if (fs.existsSync(rootFile)) { fs.unlinkSync(rootFile); return; }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "drafts" && entry.name !== "capture" && entry.name !== ".runs") {
      const f = path.join(dir, entry.name, `${id}.json`);
      if (fs.existsSync(f)) { fs.unlinkSync(f); return; }
    }
  }
}

/**
 * Write an entity file to the correct location.
 * If folderName is provided, writes to {kind}/{folderName}/{id}.json.
 * Otherwise writes to {kind}/{id}.json.
 * Any pre-existing copy of this entity (in any sub-folder) is removed first.
 * `enabled` is always stripped — enabled state lives exclusively in enabled.json.
 */
export function writeEntity(wsId: string, kind: string, id: string, data: object, folderName?: string | null): void {
  removeExistingEntityFile(wsId, kind, id);
  const file = entityFile(wsId, kind, id, folderName);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { enabled: _enabled, ...rest } = data as Record<string, unknown>;
  void _enabled;
  fs.writeFileSync(file, JSON.stringify(rest, null, 2), "utf-8");
}

/** Delete an entity file wherever it lives (root level or any sub-folder). */
export function deleteEntityFile(wsId: string, kind: string, id: string): void {
  removeExistingEntityFile(wsId, kind, id);
}

// ── Pending deletions (entities deleted from disk, not yet git-committed) ────────

interface PendingDeletion {
  id: string;
  folderId: string | null;
  name: string;
  method?: string;
  url?: string;
  urlSuffix?: string;
}

interface PendingDeletionsFile {
  [kind: string]: PendingDeletion[];
}

function pendingDeletionsFile(wsId: string): string {
  return path.join(wsDir(wsId), "pending-deletions.json");
}

function readPendingDeletions(wsId: string): PendingDeletionsFile {
  try { return JSON.parse(fs.readFileSync(pendingDeletionsFile(wsId), "utf-8")); } catch { return {}; }
}

function writePendingDeletions(wsId: string, data: PendingDeletionsFile): void {
  fs.writeFileSync(pendingDeletionsFile(wsId), JSON.stringify(data, null, 2), "utf-8");
}

export function addPendingDeletion(wsId: string, kind: string, entry: PendingDeletion): void {
  const data = readPendingDeletions(wsId);
  if (!data[kind]) data[kind] = [];
  if (!data[kind].some((e) => e.id === entry.id)) data[kind].push(entry);
  writePendingDeletions(wsId, data);
}

export function removePendingDeletion(wsId: string, kind: string, id: string): void {
  const data = readPendingDeletions(wsId);
  if (data[kind]) data[kind] = data[kind].filter((e) => e.id !== id);
  writePendingDeletions(wsId, data);
}

export function getPendingDeletions(wsId: string, kind: string): PendingDeletion[] {
  return readPendingDeletions(wsId)[kind] ?? [];
}

/** Clear all pending deletions for a kind (called after folder publish covers them all) */
export function clearPendingDeletions(wsId: string, kind: string): void {
  const data = readPendingDeletions(wsId);
  delete data[kind];
  writePendingDeletions(wsId, data);
}

const SKIP_FILES = new Set(["index.json", "enabled.json", "names.json", "pending-deletions.json"]);

export function readAllEntities<T>(wsId: string, kind: string): T[] {
  const dir = entityDir(wsId, kind);
  if (!fs.existsSync(dir)) return [];
  const results: T[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "drafts" && entry.name !== "capture" && entry.name !== ".runs") {
      const subdir = path.join(dir, entry.name);
      for (const f of fs.readdirSync(subdir)) {
        if (f.endsWith(".json") && !SKIP_FILES.has(f)) {
          try { results.push(JSON.parse(fs.readFileSync(path.join(subdir, f), "utf-8")) as T); } catch { }
        }
      }
    } else if (entry.isFile() && entry.name.endsWith(".json") && !SKIP_FILES.has(entry.name)) {
      try { results.push(JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf-8")) as T); } catch { }
    }
  }
  return results;
}

/**
 * Read only entities whose IDs are in `enabledIds`.
 * Falls back to readAllEntities if enabledIds is null.
 */
export function readEnabledEntities<T extends { id: string }>(
  wsId: string, kind: string, enabledIds: Set<string> | null,
): T[] {
  if (enabledIds === null) return readAllEntities<T>(wsId, kind);
  if (enabledIds.size === 0) return [];
  const dir = entityDir(wsId, kind);
  if (!fs.existsSync(dir)) return [];
  const results: T[] = [];
  // Check root files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json") && !SKIP_FILES.has(entry.name)) {
      const id = entry.name.slice(0, -5);
      if (enabledIds.has(id)) {
        try { results.push(JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf-8")) as T); } catch { }
      }
    } else if (entry.isDirectory() && entry.name !== "drafts" && entry.name !== "capture" && entry.name !== ".runs") {
      const subdir = path.join(dir, entry.name);
      for (const f of fs.readdirSync(subdir)) {
        if (f.endsWith(".json") && !SKIP_FILES.has(f)) {
          const id = f.slice(0, -5);
          if (enabledIds.has(id)) {
            try { results.push(JSON.parse(fs.readFileSync(path.join(subdir, f), "utf-8")) as T); } catch { }
          }
        }
      }
    }
  }
  return results;
}

/** Read a single entity file by ID (searches root and subfolders). */
export function readEntity<T>(wsId: string, kind: string, id: string): T | null {
  const file = findEntityFile(wsId, kind, id);
  if (!file) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf-8")) as T; } catch { return null; }
}

// ── Name index (names.json) ───────────────────────────────────────────────────
// Lightweight map: id → { name, method?, url? } for list display without full entity reads

export interface EntityNameEntry { name: string; method?: string; url?: string; urlSuffix?: string; endpointUrl?: string; operationName?: string; soapActionPattern?: string; serviceName?: string;[key: string]: string | undefined; }

function namesFile(wsId: string, kind: string): string {
  return path.join(entityDir(wsId, kind), "names.json");
}

export function readNamesIndex(wsId: string, kind: string): Record<string, EntityNameEntry> {
  try { return JSON.parse(fs.readFileSync(namesFile(wsId, kind), "utf-8")); } catch { return {}; }
}

function writeNamesIndex(wsId: string, kind: string, names: Record<string, EntityNameEntry>): void {
  const f = namesFile(wsId, kind);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(names, null, 2), "utf-8");
}

export function upsertNameEntry(wsId: string, kind: string, id: string, entry: EntityNameEntry): void {
  const names = readNamesIndex(wsId, kind);
  names[id] = entry;
  writeNamesIndex(wsId, kind, names);
}

export function removeNameEntry(wsId: string, kind: string, id: string): void {
  const names = readNamesIndex(wsId, kind);
  delete names[id];
  writeNamesIndex(wsId, kind, names);
}

/** Bootstrap names.json from all entity files (first-time migration). */
export function bootstrapNamesIndex<T extends { id: string; name: string; method?: string; url?: string }>(
  wsId: string, kind: string,
): Record<string, EntityNameEntry> {
  const entities = readAllEntities<T>(wsId, kind);
  const names: Record<string, EntityNameEntry> = {};
  for (const e of entities) {
    names[e.id] = { name: e.name, ...(e.method ? { method: e.method } : {}), ...(e.url ? { url: e.url } : {}) };
  }
  writeNamesIndex(wsId, kind, names);
  return names;
}

/**
 * Scan entity dir and return stubs: id + folderId from directory structure.
 * Also includes pending-deletion entries (so deleted entities still show in tree).
 */
export function readEntityStubs(
  wsId: string, kind: string,
): Array<{ id: string; folderId: string | null }> {
  const dir = entityDir(wsId, kind);
  if (!fs.existsSync(dir)) return [];
  const stubs: Array<{ id: string; folderId: string | null }> = [];
  const seenIds = new Set<string>();
  const idx = readIndex(wsId, kind);
  const folderDirToId = new Map(idx.folders.map((f) => [sanitizeDirName(f.name), f.id]));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json") &&
      entry.name !== "index.json" && entry.name !== "enabled.json" && entry.name !== "names.json") {
      const id = entry.name.slice(0, -5);
      stubs.push({ id, folderId: null });
      seenIds.add(id);
    } else if (entry.isDirectory() && entry.name !== "drafts" && entry.name !== "capture" && entry.name !== ".runs") {
      const folderId = folderDirToId.get(entry.name) ?? null;
      const subdir = path.join(dir, entry.name);
      for (const f of fs.readdirSync(subdir)) {
        if (f.endsWith(".json") && f !== "index.json" && f !== "enabled.json" && f !== "names.json") {
          const id = f.slice(0, -5);
          stubs.push({ id, folderId });
          seenIds.add(id);
        }
      }
    }
  }
  // Append pending-deletion stubs (entity file gone, waiting for git commit)
  const pending = getPendingDeletions(wsId, kind);
  for (const p of pending) {
    if (!seenIds.has(p.id)) stubs.push({ id: p.id, folderId: p.folderId });
  }
  return stubs;
}

// ── Index helpers ─────────────────────────────────────────────────────────────

export function readIndex(wsId: string, kind: string): EntityIndex {
  try { return JSON.parse(fs.readFileSync(indexFile(wsId, kind), "utf-8")) as EntityIndex; }
  catch { return { folders: [], order: [] }; }
}

export function writeIndex(wsId: string, kind: string, idx: EntityIndex): void {
  const f = indexFile(wsId, kind);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(idx, null, 2), "utf-8");
}

// ── Entity-path resolver (for git staging) ────────────────────────────────────

/**
 * Compute the relative path for a (not yet written) entity.
 * If folderName is provided: {kind}/{sanitizedFolderName}/{id}.json
 * Otherwise: {kind}/{id}.json
 */
export function entityRelPath(kind: string, id: string, folderName?: string | null): string {
  if (folderName) return `${kind}/${sanitizeDirName(folderName)}/${id}.json`;
  return `${kind}/${id}.json`;
}

/**
 * Find the current relative path of an existing entity file.
 * Returns null if the entity does not exist on disk.
 */
export function findEntityRelPath(wsId: string, kind: string, id: string): string | null {
  const dir = entityDir(wsId, kind);
  if (!fs.existsSync(dir)) return null;
  if (fs.existsSync(path.join(dir, `${id}.json`))) return `${kind}/${id}.json`;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "drafts" && entry.name !== "capture" && entry.name !== ".runs") {
      if (fs.existsSync(path.join(dir, entry.name, `${id}.json`))) {
        return `${kind}/${entry.name}/${id}.json`;
      }
    }
  }
  return null;
}

// ── Folder directory management ───────────────────────────────────────────────

/** Delete a folder's directory (called after all its items have been moved out). */
export function deleteEntityDir(wsId: string, kind: string, folderName: string): void {
  const dir = path.join(entityDir(wsId, kind), sanitizeDirName(folderName));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Scan the kind directory for subdirectories not yet registered in the index,
 * auto-register them, and return the (possibly updated) index.
 */
export function autoSyncFsDirectories(wsId: string, kind: string, makeId: () => string): EntityIndex {
  const idx = readIndex(wsId, kind);
  const dir = entityDir(wsId, kind);
  if (!fs.existsSync(dir)) return idx;

  const subDirs = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "drafts" && e.name !== "capture" && e.name !== ".runs")
    .map((e) => e.name);

  let changed = false;
  for (const dirName of subDirs) {
    if (!idx.folders.some((f) => sanitizeDirName(f.name) === dirName)) {
      idx.folders.push({
        id: makeId(),
        name: dirName,
        parentId: null,
        createdAt: Date.now(),
        workspaceId: wsId,
      });
      changed = true;
    }
  }

  if (changed) writeIndex(wsId, kind, idx);
  return idx;
}

// ── Flat entity kinds (no subfolder, stored directly in kind/) ────────────────

export function writeFlatEntity(wsId: string, kind: string, id: string, data: object): void {
  const file = path.join(entityDir(wsId, kind), `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { enabled: _enabled, ...rest } = data as Record<string, unknown>;
  void _enabled;
  fs.writeFileSync(file, JSON.stringify(rest, null, 2), "utf-8");
}

export function deleteFlatEntityFile(wsId: string, kind: string, id: string): void {
  const file = path.join(entityDir(wsId, kind), `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function flatEntityRelPath(kind: string, id: string): string {
  return `${kind}/${id}.json`;
}

// ── Enabled-set helpers ───────────────────────────────────────────────────────

/**
 * Read the set of enabled entity IDs for a given kind.
 * Returns null if the enabled.json doesn't exist yet (meaning "use entity.enabled field" as fallback).
 */
export function readEnabledSet(wsId: string, kind: string): Set<string> | null {
  const file = path.join(entityDir(wsId, kind), "enabled.json");
  try {
    const ids = JSON.parse(fs.readFileSync(file, "utf-8")) as string[];
    return new Set(ids);
  } catch {
    return null;
  }
}

/** Write the enabled set for a kind to disk. */
export function writeEnabledSet(wsId: string, kind: string, ids: Set<string>): void {
  const file = path.join(entityDir(wsId, kind), "enabled.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Array.from(ids), null, 2), "utf-8");
}

/**
 * Bootstrap enabled.json from existing entity files (first-time migration).
 * Reads all entities and writes enabled.json with the IDs that have enabled=true.
 */
export function bootstrapEnabledSet<T extends { id: string; enabled?: boolean }>(
  wsId: string, kind: string,
): Set<string> {
  const entities = readAllEntities<T>(wsId, kind);
  const enabled = new Set(entities.filter((e) => e.enabled !== false).map((e) => e.id));
  writeEnabledSet(wsId, kind, enabled);
  return enabled;
}

// ── Find an entity file's absolute path ──────────────────────────────────────

export function findEntityFile(wsId: string, kind: string, id: string): string | null {
  const dir = entityDir(wsId, kind);
  if (!fs.existsSync(dir)) return null;
  const rootFile = path.join(dir, `${id}.json`);
  if (fs.existsSync(rootFile)) return rootFile;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "drafts" && entry.name !== "capture" && entry.name !== ".runs") {
      const f = path.join(dir, entry.name, `${id}.json`);
      if (fs.existsSync(f)) return f;
    }
  }
  return null;
}
