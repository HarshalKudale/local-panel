# Plan 00: Folder-Based Data Layer

## Overview

Replace the monolithic `config.json` with a folder-per-workspace layout where every entity lives as its own file. Each workspace folder is independently tracked by a git repo — mutations commit only the changed file, not a 200 KB snapshot of everything. This eliminates spurious "save with no changes" commits, gives clean per-file git history, and makes each workspace independently syncable (Plan 01).

This is the **foundation plan**. Plans 04, 06, 01, 02, 03, and 05 all build on this data layer.

## What Changes vs. the Current Approach

| Current | New |
|---|---|
| `userData/config.json` — one JSON blob for all workspaces | `userData/data/{wsId}/` — one folder per workspace |
| `userData/data/workspaces/{wsId}.json` — per-workspace git snapshot | Removed — entities are individual files |
| One shared git repo for all workspaces | One git repo per workspace folder |
| `withGitCommit` writes a full JSON snapshot then commits | `withGitCommit` stages only the changed entity file |
| Spurious commits when saving unchanged data (--allow-empty) | No commit if nothing staged (git detects no diff) |
| Audit log reads commit messages from a single repo | Audit log reads commit messages per workspace repo |
| Sync (Plan 01) must push all workspaces together | Each workspace pushed/pulled independently |

## File Layout

```
userData/
  app.json                          # Global settings — NOT git-tracked
  data/
    {wsId}/                         # One folder per workspace
      .git/                         # Workspace-scoped git repo
      .gitignore                    # ignores: capture/
      workspace.json                # Workspace metadata (name, createdAt, activeEnvironmentId)
      mappings/
        {id}.json
      rules/
        {id}.json
      environments/
        {id}.json
      mocks/
        root/                       # Unsorted mocks
        drafts/                     # Auto-saved drafts (not committed)
        {folderId}/                 # One subfolder per mock folder
          {id}.json
      requests/
        root/
        drafts/
        {folderId}/
          {id}.json
      sockets/
        root/
        {folderId}/
          {id}.json
      capture/                      # NOT git-tracked — excluded by .gitignore
        entries.json
```

### File contents

**`app.json`** — global settings (replaces the global fields from `config.json`):
```ts
interface AppSettings {
  port: number;
  minimizeToTray: boolean;
  workspaces: WorkspaceMeta[];       // id, name, activeEnvironmentId — no entity data
  activeWorkspaceId: string;
}
```

**`{wsId}/workspace.json`** — workspace metadata:
```ts
interface WorkspaceFile {
  id: string;
  name: string;
  createdAt: number;
  activeEnvironmentId: string | null;
}
```

**`{wsId}/mappings/{id}.json`** — one `LocalMapping` object per file.

**`{wsId}/rules/{id}.json`** — one `ProxyRule` object per file.

**`{wsId}/environments/{id}.json`** — one `Environment` object (including its `variables` array) per file.

**`{wsId}/mocks/{folderPath}/{id}.json`** — one `MockRule` per file. `folderPath` is `root` for top-level mocks, the folder's ID for items inside a folder, or `drafts` for unsaved drafts.

**`{wsId}/requests/{folderPath}/{id}.json`** — one `SavedRequest` per file.

**`{wsId}/sockets/{folderPath}/{id}.json`** — one `SavedWsConnection` per file.

**`{wsId}/capture/entries.json`** — array of `RequestLogEntry[]`. Not git-tracked.

### Index files

Each entity type that supports tree display (mocks, requests, sockets) has an index file used for ordering, search, and high-level metadata:

**`{wsId}/mocks/index.json`**:
```ts
interface MockIndex {
  folders: FolderEntry[];  // ordered folder list
  order: string[];         // ordered mock IDs across all folders
}
```

**`{wsId}/requests/index.json`** — same shape.
**`{wsId}/sockets/index.json`** — same shape.

Flat entity types (mappings, rules, environments) do not need an index — they are read by scanning the folder.

## Why Per-Entity Files

- **No spurious commits.** `git add mocks/root/mock_abc.json && git commit` only commits if the file content changed. No `--allow-empty`. No audit noise when saving unchanged data.
- **Clean per-entity history.** `git log mocks/root/mock_abc.json` gives the full mutation history of one mock — trivially — without parsing commit messages.
- **Folder tree = file system tree.** The `mocks/` directory mirrors the UI folder tree directly. No URL-based tree derivation needed.
- **Faster writes.** Writing one 2 KB mock file is faster than rewriting a 500 KB `config.json` blob.
- **Sync granularity.** `git merge` operates at the file level — two teammates editing different mocks never conflict.

## Git Repository per Workspace

Each `{wsId}/` folder is its own `.git` repo (not a submodule — a standalone repo). Reasons:

- **Independent sync.** Each workspace can be pushed to a different remote, on a different schedule, without touching other workspaces.
- **Independent history.** Cloning a workspace repo only contains that workspace's history.
- **Clean conflict resolution.** `git merge` sees per-entity files; two teammates editing different mocks produce zero conflicts.
- **Capture excluded.** `.gitignore` excludes `capture/` — transient traffic logs never pollute the sync payload.

### Git commit schema

Same structured commit message format as the previous design — this is carried forward:

```
<action>(<entity>): <entityName>

entity-id: <id>
workspace-id: <wsId>
actor: <email-or-"local">
```

The only change: `git add` stages a specific entity file (e.g. `mocks/root/mock_abc.json`) instead of the whole workspace JSON blob.

## Data Model

`src/store/types.ts` remains unchanged — all entity interfaces stay the same. The following new interfaces are added:

```ts
// app.json structure
export interface AppSettings {
  port: number;
  minimizeToTray: boolean;
  workspaces: WorkspaceMeta[];
  activeWorkspaceId: string;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  activeEnvironmentId: string | null;
  syncConfig?: SyncConfig;   // filled in by Plan 01
}

// workspace.json structure
export interface WorkspaceFile {
  id: string;
  name: string;
  createdAt: number;
  activeEnvironmentId: string | null;
}

// index.json structure (for mocks, requests, sockets)
export interface FolderEntry {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface EntityIndex {
  folders: FolderEntry[];
  order: string[];
}
```

## Backward Compatibility: The `AppConfig` Adapter

All existing IPC handlers, renderer panels, and tests use `loadConfig(): AppConfig` and `saveConfig(cfg: AppConfig)`. These keep working — `config.ts` assembles a flat `AppConfig` from the folder-based store, and `saveConfig` routes writes back to individual files.

```ts
// src/store/config.ts  (conceptual — implemented in Step 3)
export function loadConfig(): AppConfig {
  const settings = loadSettings();
  const wsId = settings.activeWorkspaceId;
  const wsData = loadWorkspaceData(wsId);
  return { ...settings, ...wsData, workspaces: buildWorkspaceList(settings) };
}

export function saveConfig(cfg: AppConfig): void {
  saveSettings(extractSettings(cfg));
  saveWorkspaceData(cfg.activeWorkspaceId, cfg);
}
```

`saveWorkspaceData` writes only the files that changed (by comparing content before writing).

## Implementation Steps

### Step 1 — `src/store/appSettings.ts` (new)

Reads/writes `userData/app.json`. Replaces the global-settings portion of `config.ts`.

```ts
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { AppSettings, WorkspaceMeta } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  port: 80,
  minimizeToTray: true,
  workspaces: [{ id: "default", name: "Workspace 1", activeEnvironmentId: null }],
  activeWorkspaceId: "default",
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), "app.json");
}

export function loadSettings(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), "utf-8")) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: AppSettings): void {
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), "utf-8");
}
```

**Deliverable:** Global settings read/written independently of entity data.

---

### Step 2 — `src/store/workspaceFs.ts` (new)

All workspace entity file operations. This is the core of the new data layer.

```ts
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import {
  MockRule, LocalMapping, ProxyRule, SavedRequest,
  SavedWsConnection, Environment, Folder, WorkspaceFile, EntityIndex,
} from "./types";

// ── Path helpers ───────────────────────────────────────────────────────────────

export function dataRoot(): string {
  return path.join(app.getPath("userData"), "data");
}

export function wsDir(wsId: string): string {
  return path.join(dataRoot(), wsId);
}

function entityDir(wsId: string, kind: string): string {
  return path.join(wsDir(wsId), kind);
}

function entityFile(wsId: string, kind: string, id: string, folderId?: string | null): string {
  const subdir = folderId ? folderId : "root";
  return path.join(entityDir(wsId, kind), subdir, `${id}.json`);
}

function indexFile(wsId: string, kind: string): string {
  return path.join(entityDir(wsId, kind), "index.json");
}

// ── Workspace init ─────────────────────────────────────────────────────────────

export function initWorkspaceDir(wsId: string, name: string): void {
  const dirs = [
    wsDir(wsId),
    entityDir(wsId, "mappings"),
    entityDir(wsId, "rules"),
    entityDir(wsId, "environments"),
    path.join(entityDir(wsId, "mocks"), "root"),
    path.join(entityDir(wsId, "mocks"), "drafts"),
    path.join(entityDir(wsId, "requests"), "root"),
    path.join(entityDir(wsId, "requests"), "drafts"),
    path.join(entityDir(wsId, "sockets"), "root"),
    path.join(entityDir(wsId, "capture")),
  ];
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });

  const wsFile = path.join(wsDir(wsId), "workspace.json");
  if (!fs.existsSync(wsFile)) {
    const wf: WorkspaceFile = { id: wsId, name, createdAt: Date.now(), activeEnvironmentId: null };
    fs.writeFileSync(wsFile, JSON.stringify(wf, null, 2), "utf-8");
  }

  const gitignore = path.join(wsDir(wsId), ".gitignore");
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, "capture/\ndrafts/\n*.tmp\n", "utf-8");
  }
}

// ── Generic read/write ─────────────────────────────────────────────────────────

export function writeEntity(wsId: string, kind: string, id: string, data: object, folderId?: string | null): void {
  const file = entityFile(wsId, kind, id, folderId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

export function deleteEntityFile(wsId: string, kind: string, id: string, folderId?: string | null): void {
  const file = entityFile(wsId, kind, id, folderId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function readAllEntities<T>(wsId: string, kind: string): T[] {
  const dir = entityDir(wsId, kind);
  if (!fs.existsSync(dir)) return [];
  const results: T[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "drafts" && entry.name !== "capture") {
      const subdir = path.join(dir, entry.name);
      for (const f of fs.readdirSync(subdir)) {
        if (f.endsWith(".json") && f !== "index.json") {
          try { results.push(JSON.parse(fs.readFileSync(path.join(subdir, f), "utf-8")) as T); } catch {}
        }
      }
    } else if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json") {
      try { results.push(JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf-8")) as T); } catch {}
    }
  }
  return results;
}

// ── Index helpers ──────────────────────────────────────────────────────────────

export function readIndex(wsId: string, kind: string): EntityIndex {
  try { return JSON.parse(fs.readFileSync(indexFile(wsId, kind), "utf-8")) as EntityIndex; }
  catch { return { folders: [], order: [] }; }
}

export function writeIndex(wsId: string, kind: string, idx: EntityIndex): void {
  fs.writeFileSync(indexFile(wsId, kind), JSON.stringify(idx, null, 2), "utf-8");
}

// ── Entity-path resolver (for git staging) ────────────────────────────────────

export function entityRelPath(wsId: string, kind: string, id: string, folderId?: string | null): string {
  const subdir = folderId ?? "root";
  return path.join(kind, subdir, `${id}.json`).replace(/\\/g, "/");
}
```

**Deliverable:** All file I/O for entity data is encapsulated here. No direct `fs` calls in handlers.

---

### Step 3 — `src/store/gitStore.ts` (rewrite)

Per-workspace git repos. The key change from the previous gitStore: `getGit(wsId)` returns a `SimpleGit` instance rooted at `wsDir(wsId)`, and `commitMutation` stages only the specific entity file that changed.

```ts
import simpleGit, { SimpleGit } from "simple-git";
import * as path from "path";
import * as fs from "fs";
import { wsDir } from "./workspaceFs";
import { AuditAction, AuditEntity, AuditEntry } from "./types";

// ── Git singleton per workspace ────────────────────────────────────────────────

const _gitCache = new Map<string, SimpleGit>();

export function getGit(wsId: string): SimpleGit {
  if (!_gitCache.has(wsId)) _gitCache.set(wsId, simpleGit(wsDir(wsId)));
  return _gitCache.get(wsId)!;
}

// For tests: override the data root so git operates on a temp dir
let _dataRootOverride: string | null = null;
export function setDataRootOverride(root: string | null): void {
  _dataRootOverride = root;
  _gitCache.clear();
}

export function resolvedWsDir(wsId: string): string {
  return _dataRootOverride ? path.join(_dataRootOverride, wsId) : wsDir(wsId);
}

// ── Startup ────────────────────────────────────────────────────────────────────

export async function checkGitInstalled(): Promise<boolean> {
  try { await simpleGit().raw(["--version"]); return true; } catch { return false; }
}

export async function initWorkspaceRepo(wsId: string): Promise<void> {
  const dir = resolvedWsDir(wsId);
  if (!fs.existsSync(path.join(dir, ".git"))) {
    const g = simpleGit(dir);
    await g.init();
    // .gitignore was written by initWorkspaceDir()
    await g.add(".gitignore");
    await g.commit("chore: init workspace repo");
  }
}

// ── Commit ─────────────────────────────────────────────────────────────────────

export async function commitMutation(opts: {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityName: string;
  workspaceId: string;
  relPath: string;       // entity file path relative to workspace root (e.g. "mocks/root/mock_abc.json")
  actor?: string;
  message?: string;
}): Promise<string> {
  const actor = opts.actor ?? "local";
  const subject = opts.message
    ? `${opts.action}(${opts.entity}): ${opts.entityName} — ${opts.message}`
    : `${opts.action}(${opts.entity}): ${opts.entityName}`;
  const body = [
    `entity-id: ${opts.entityId}`,
    `workspace-id: ${opts.workspaceId}`,
    `actor: ${actor}`,
  ].join("\n");

  const g = getGit(opts.workspaceId);

  if (opts.action === "delete") {
    // For deletes, the file is already removed — stage the removal
    try { await g.raw(["rm", "--cached", "--ignore-unmatch", opts.relPath]); } catch {}
  } else {
    await g.add(opts.relPath);
  }

  // Check if there is anything staged — skip commit if nothing changed
  const status = await g.status();
  const hasStagedChanges =
    status.staged.length > 0 ||
    status.created.length > 0 ||
    status.deleted.length > 0 ||
    status.renamed.length > 0;

  if (!hasStagedChanges) return "";   // No-op — nothing changed

  const result = await g.commit(`${subject}\n\n${body}`);
  return result.commit;
}

// ── Query ──────────────────────────────────────────────────────────────────────

export interface QueryLogOptions {
  workspaceId: string;
  entity?: AuditEntity;
  action?: AuditAction;
  entityId?: string;
  filePath?: string;     // filter by specific entity file (e.g. "mocks/root/mock_abc.json")
  fromTs?: number;
  toTs?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function queryLog(opts: QueryLogOptions): Promise<{ entries: AuditEntry[]; total: number }> {
  const g = getGit(opts.workspaceId);

  const args: string[] = ["log", "--format=%H%n%at%n%s%n%b%n---END---"];
  if (opts.filePath) args.push("--", opts.filePath);

  let raw: string;
  try { raw = await g.raw(args); } catch { return { entries: [], total: 0 }; }

  const blocks = raw.split("---END---\n").filter((b) => b.trim());
  let entries: AuditEntry[] = blocks.map((block): AuditEntry | null => {
    const lines = block.trim().split("\n");
    const [hash, tsStr, subject, ...bodyLines] = lines;
    if (!hash || !tsStr || !subject) return null;
    const body = bodyLines.join("\n");
    const entityId   = body.match(/entity-id: (.+)/)?.[1]?.trim() ?? "";
    const wsId       = body.match(/workspace-id: (.+)/)?.[1]?.trim() ?? "";
    const actor      = body.match(/actor: (.+)/)?.[1]?.trim() ?? "local";
    const match      = subject.match(/^(create|update|delete)\((\w+)\): (.+)$/);
    if (!match) return null;
    const rawName    = match[3];
    const entityName = rawName.split(" — ")[0].trim();
    return {
      commitHash: hash.trim(),
      ts: parseInt(tsStr, 10) * 1000,
      action: match[1] as AuditAction,
      entity: match[2] as AuditEntity,
      entityName,
      entityId,
      workspaceId: wsId,
      actor,
    };
  }).filter((e): e is AuditEntry => e !== null);

  if (opts.entity)   entries = entries.filter((e) => e.entity === opts.entity);
  if (opts.action)   entries = entries.filter((e) => e.action === opts.action);
  if (opts.entityId) entries = entries.filter((e) => e.entityId === opts.entityId);
  if (opts.fromTs)   entries = entries.filter((e) => e.ts >= opts.fromTs!);
  if (opts.toTs)     entries = entries.filter((e) => e.ts <= opts.toTs!);
  if (opts.search)   entries = entries.filter((e) => e.entityName.toLowerCase().includes(opts.search!.toLowerCase()));

  const total  = entries.length;
  const offset = opts.offset ?? 0;
  const limit  = opts.limit === 0 ? entries.length : (opts.limit ?? 200);
  return { entries: entries.slice(offset, offset + limit), total };
}

// ── Point-in-time reads ────────────────────────────────────────────────────────

export async function getEntityAtCommit(
  commitRef: string,
  wsId: string,
  relPath: string,       // e.g. "mocks/root/mock_abc.json"
): Promise<unknown | null> {
  try {
    const content = await getGit(wsId).show(`${commitRef}:${relPath}`);
    return JSON.parse(content);
  } catch { return null; }
}
```

**Key difference from previous gitStore:** `commitMutation` now requires a `relPath` (the specific entity file) and will produce **no commit** if the file content hasn't changed. This is the fix for spurious audit entries on no-change saves.

**Deliverable:** Per-workspace git repos with clean per-entity commits. No spurious commits. Independently testable with a temp directory.

---

### Step 4 — `src/store/config.ts` (update adapter)

Keep `loadConfig()` and `saveConfig()` as the public API — all existing IPC handlers continue to work. Internally, route reads and writes to the new folder-based layer.

The adapter assembles a flat `AppConfig` by reading all entity files for the active workspace. On save, it routes writes back to individual files.

```ts
// src/store/config.ts (simplified — full implementation)
import { loadSettings, saveSettings } from "./appSettings";
import { readAllEntities, readIndex, writeEntity, deleteEntityFile, initWorkspaceDir } from "./workspaceFs";
import { AppConfig, MockRule, LocalMapping, ProxyRule, SavedRequest, SavedWsConnection, Environment, Folder } from "./types";

export function loadConfig(): AppConfig {
  const settings = loadSettings();
  const wsId = settings.activeWorkspaceId;
  return assembleConfig(settings, wsId);
}

function assembleConfig(settings: ReturnType<typeof loadSettings>, wsId: string): AppConfig {
  const mocks        = readAllEntities<MockRule>(wsId, "mocks");
  const mappings     = readAllEntities<LocalMapping>(wsId, "mappings");
  const proxyRules   = readAllEntities<ProxyRule>(wsId, "rules");
  const requests     = readAllEntities<SavedRequest>(wsId, "requests");
  const wsConnections = readAllEntities<SavedWsConnection>(wsId, "sockets");
  const environments = readAllEntities<Environment>(wsId, "environments");
  const { folders: mockFolders } = readIndex(wsId, "mocks");
  const { folders: requestFolders } = readIndex(wsId, "requests");
  const { folders: wsFolders } = readIndex(wsId, "sockets");

  return {
    port: settings.port,
    minimizeToTray: settings.minimizeToTray,
    workspaces: settings.workspaces.map((w) => ({
      id: w.id, name: w.name, createdAt: 0, activeEnvironmentId: w.activeEnvironmentId,
    })),
    activeWorkspaceId: wsId,
    activeEnvironmentId: settings.workspaces.find((w) => w.id === wsId)?.activeEnvironmentId ?? null,
    mappings,
    proxyRules,
    mocks,
    requests,
    wsConnections,
    mockFolders: mockFolders as Folder[],
    requestFolders: requestFolders as Folder[],
    wsConnections,
    wsFolders: wsFolders as Folder[],
    environments,
  };
}

export function saveConfig(cfg: AppConfig): void {
  // Save global settings
  const settings = loadSettings();
  settings.port = cfg.port;
  settings.minimizeToTray = cfg.minimizeToTray;
  settings.activeWorkspaceId = cfg.activeWorkspaceId;
  // Update workspace metadata
  for (const ws of (cfg.workspaces ?? [])) {
    const existing = settings.workspaces.find((w) => w.id === ws.id);
    if (existing) { existing.name = ws.name; existing.activeEnvironmentId = ws.activeEnvironmentId; }
    else settings.workspaces.push({ id: ws.id, name: ws.name, activeEnvironmentId: ws.activeEnvironmentId });
  }
  saveSettings(settings);

  // Save workspace entities to individual files
  const wsId = cfg.activeWorkspaceId;
  for (const m of (cfg.mocks ?? []))        writeEntity(wsId, "mocks", m.id, m, m.folderId ?? null);
  for (const m of (cfg.mappings ?? []))      writeEntity(wsId, "mappings", m.id, m);
  for (const r of (cfg.proxyRules ?? []))    writeEntity(wsId, "rules", r.id, r);
  for (const r of (cfg.requests ?? []))      writeEntity(wsId, "requests", r.id, r, r.folderId ?? null);
  for (const c of (cfg.wsConnections ?? [])) writeEntity(wsId, "sockets", c.id, c, c.folderId ?? null);
  for (const e of (cfg.environments ?? []))  writeEntity(wsId, "environments", e.id, e);
}
```

> **Note:** The `saveConfig` adapter is intentionally simple for migration. Over time, IPC handlers will call `writeEntity` / `deleteEntityFile` directly (Step 6) to avoid scanning and rewriting all files on every save.

**Deliverable:** `loadConfig()` and `saveConfig()` continue to work for all existing handlers with zero changes to those handlers.

---

### Step 5 — Migration from `config.json` (`src/store/migration.ts`)

Runs once on first launch. Reads the legacy `config.json`, writes all entities to the new folder layout, initializes per-workspace git repos, then renames the legacy file.

```ts
export async function migrateFromConfigJson(): Promise<void> {
  const legacy = path.join(app.getPath("userData"), "config.json");
  if (!fs.existsSync(legacy)) return;

  // Check if already migrated (any workspace folder with .git exists)
  const settings = loadSettings();
  const firstWs = settings.workspaces[0];
  if (firstWs && fs.existsSync(path.join(wsDir(firstWs.id), ".git"))) return;

  const cfg = JSON.parse(fs.readFileSync(legacy, "utf-8")) as AppConfig;

  // Write app.json
  saveSettings({
    port: cfg.port,
    minimizeToTray: cfg.minimizeToTray ?? true,
    workspaces: (cfg.workspaces ?? []).map((w) => ({
      id: w.id, name: w.name, activeEnvironmentId: w.activeEnvironmentId,
    })),
    activeWorkspaceId: cfg.activeWorkspaceId ?? "default",
  });

  // Write per-workspace entity files
  for (const ws of (cfg.workspaces ?? [])) {
    initWorkspaceDir(ws.id, ws.name);
    const wsId = ws.id;
    for (const m of (cfg.mocks ?? []).filter((m) => m.workspaceId === wsId))
      writeEntity(wsId, "mocks", m.id, m, m.folderId ?? null);
    for (const m of (cfg.mappings ?? []).filter((m) => m.workspaceId === wsId))
      writeEntity(wsId, "mappings", m.id, m);
    for (const r of (cfg.proxyRules ?? []).filter((r) => r.workspaceId === wsId))
      writeEntity(wsId, "rules", r.id, r);
    for (const r of (cfg.requests ?? []).filter((r) => r.workspaceId === wsId))
      writeEntity(wsId, "requests", r.id, r, r.folderId ?? null);
    for (const c of (cfg.wsConnections ?? []).filter((c) => c.workspaceId === wsId))
      writeEntity(wsId, "sockets", c.id, c, c.folderId ?? null);
    for (const e of (cfg.environments ?? []).filter((e) => e.workspaceId === wsId))
      writeEntity(wsId, "environments", e.id, e);

    // Write folder indexes
    const mockFolders = (cfg.mockFolders ?? []).filter((f) => f.workspaceId === wsId);
    const reqFolders  = (cfg.requestFolders ?? []).filter((f) => f.workspaceId === wsId);
    const wsFolders   = (cfg.wsFolders ?? []).filter((f) => f.workspaceId === wsId);
    writeIndex(wsId, "mocks",    { folders: mockFolders, order: (cfg.mocks ?? []).filter((m) => m.workspaceId === wsId).map((m) => m.id) });
    writeIndex(wsId, "requests", { folders: reqFolders,  order: (cfg.requests ?? []).filter((r) => r.workspaceId === wsId).map((r) => r.id) });
    writeIndex(wsId, "sockets",  { folders: wsFolders,   order: (cfg.wsConnections ?? []).filter((c) => c.workspaceId === wsId).map((c) => c.id) });

    // Init git repo and commit initial state
    await initWorkspaceRepo(wsId);
    const g = simpleGit(wsDir(wsId));
    await g.add(".");
    try {
      await g.commit("chore: migrate from config.json");
    } catch {} // nothing staged if workspace was empty
  }

  fs.renameSync(legacy, legacy + ".bak");
}
```

**Deliverable:** Existing users' data migrated on first launch. `config.json.bak` kept as safety net.

---

### Step 6 — Update `withGitCommit` in `src/ipc/handlers.ts`

Replace the current `withGitCommit` (which writes a workspace-scoped JSON snapshot) with one that calls `commitMutation` with the specific entity file's `relPath`.

The key change: handlers now pass the entity's file path, not a workspace-level snapshot. `commitMutation` stages only that file.

```ts
import { commitMutation, initWorkspaceRepo } from "../store/gitStore";
import { writeEntity, deleteEntityFile, entityRelPath } from "../store/workspaceFs";

async function withGitCommit<T>(
  action: AuditAction,
  entity: AuditEntity,
  entityId: string,
  entityName: string,
  workspaceId: string,
  relPath: string,           // relative path within the workspace git repo
  doMutate: () => T,
  commitMessage?: string,
): Promise<T> {
  const result = doMutate();
  try {
    await commitMutation({
      action, entity, entityId, entityName, workspaceId, relPath,
      actor: currentActor(), message: commitMessage,
    });
  } catch { /* never block mutation */ }
  return result;
}
```

Each handler computes `relPath` from the entity's folder:
```ts
// mock:update example
ipcMain.handle("mock:update", async (_e, mock: MockRule & { _commitMessage?: string }) => {
  const { _commitMessage, ...cleanMock } = mock;
  const cfg = loadConfig();
  const idx = cfg.mocks.findIndex((m) => m.id === cleanMock.id);
  if (idx === -1) return { ok: true };
  cfg.mocks[idx] = cleanMock;
  writeEntity(cleanMock.workspaceId, "mocks", cleanMock.id, cleanMock, cleanMock.folderId ?? null);
  reloadConfig();
  const relPath = entityRelPath(cleanMock.workspaceId, "mocks", cleanMock.id, cleanMock.folderId ?? null);
  return withGitCommit("update", "mock", cleanMock.id, cleanMock.name, cleanMock.workspaceId, relPath, () => ({ ok: true }), _commitMessage);
});
```

**Deliverable:** Every mutation stages exactly the file that changed. No spurious commits. No `--allow-empty`.

---

### Step 7 — Workspace lifecycle handlers (create / delete / rename)

When a workspace is created: call `initWorkspaceDir(wsId, name)` then `initWorkspaceRepo(wsId)`.

When a workspace is deleted: remove `data/{wsId}/` entirely (with `fs.rmSync`).

When a workspace is renamed: update `workspace.json` and `app.json`. Commit the `workspace.json` change.

---

### Step 8 — Remove old gitStore artifacts

- Delete `src/store/gitStore.ts` old content (replaced in Step 3).
- Delete `writeWorkspaceSnapshot` (no longer needed).
- Remove the `--allow-empty` flag usage.
- Remove the `workspaces/{wsId}.json` path from `commitMutation`.
- Remove `userData/data/workspaces/` directory (replaced by `userData/data/{wsId}/`).

---

### Step 9 — Update startup in `src/main.ts`

```ts
import { migrateFromConfigJson } from "./store/migration";
import { checkGitInstalled } from "./store/gitStore";
import { loadSettings } from "./store/appSettings";
import { initWorkspaceDir, wsDir } from "./store/workspaceFs";
import { initWorkspaceRepo } from "./store/gitStore";

app.whenReady().then(async () => {
  const hasGit = await checkGitInstalled();
  if (!hasGit) {
    dialog.showErrorBox("Git required", "...");
    app.quit();
    return;
  }

  await migrateFromConfigJson();

  // Ensure all known workspaces have initialized dirs and repos
  const settings = loadSettings();
  for (const ws of settings.workspaces) {
    initWorkspaceDir(ws.id, ws.name);
    await initWorkspaceRepo(ws.id);
  }

  registerIpcHandlers();
  createWindow();
  createTray();
  const cfg = loadConfig();
  startServer(cfg.port);
});
```

**Deliverable:** All workspaces guaranteed to have their folder structure and git repo before any IPC handler runs.

---

### Step 10 — Update tests

The gitStore test suite (currently at `tests/store/gitStore.test.ts`) needs to be updated:
- `setDataRootOverride(tmpDir)` instead of `setDataDirOverride(tmpDir)`
- `initWorkspaceDir` called before `initWorkspaceRepo`
- `writeEntity` instead of `writeWorkspaceFile` helper
- `commitMutation` now requires `relPath`
- Tests verify no commit is created on save-with-no-change (the spurious commit fix)

The handlers test suite (`tests/ipc/handlers.test.ts`):
- Mock `workspaceFs` module in addition to `gitStore`
- All mock shapes remain the same

**Deliverable:** Full test coverage for the new data layer. Green on first run.

## IPC Surface Changes

No new IPC channels. All existing channels keep the same names and return types. The implementation routes through the new file layer internally.

The only externally visible change: `audit:list` and `audit:diff` calls now query per-workspace git repos (handled transparently in `queryLog` and `getEntityAtCommit`).

## UI Changes

None at this layer. All existing panels continue to use `loadConfig()` / `saveConfig()` via IPC. The folder tree in the sidebar for mocks and requests can be rebuilt from the `EntityIndex` in a future UI pass, but that is not required for Plan 00 to ship.

## Testing Notes

- **Step 2:** Call `writeEntity`, `readAllEntities`, `readIndex`/`writeIndex` against a temp dir. Assert files are created at correct paths. Assert `readAllEntities` picks up files from all subfolders.
- **Step 3:** In a temp dir, call `initWorkspaceRepo`, write one mock file, call `commitMutation`. Assert `git log -1` shows the commit. Write the same mock content again, call `commitMutation` — assert no new commit (the spurious-commit fix).
- **Step 4:** Call `loadConfig()` against a temp dir with mock files. Assert the returned `AppConfig` contains all entities. Call `saveConfig(cfg)` and assert individual files updated.
- **Step 5:** Run `migrateFromConfigJson` against a fixture `config.json`. Assert all entity files created, `app.json` exists, per-workspace `.git` repos initialized, `config.json.bak` created.
- **Step 6:** Call `mock:update` IPC twice with identical data. Assert `git log --oneline` in the workspace dir shows only one new commit (second save was a no-op).

## Out of Scope

- Full-text search across entity file content (Plan 06 adds per-entity history; search across all entity files is a future plan).
- Removing the `AppConfig` adapter — all panels use `loadConfig()` and that interface is stable.
- URL-based folder tree in the sidebar (the current folder tree using `mockFolders` / `FolderTree` continues to work unchanged — the filesystem folder structure matches the UI tree but the UI still reads from the index, not the filesystem).
- Moving captures out of memory into the new capture folder (Plan 05 covers this).
- Binary/large file handling — all entity files are small JSON; no special git-lfs setup needed.
