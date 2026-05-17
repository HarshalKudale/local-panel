# Plan 01: Shared Config Sync

## Overview

Teams share workspace configuration — mocks, mappings, environments, proxy rules, requests, WebSocket connections — via a **git remote**. Because Plan 00 stores each workspace as its own git repo (`userData/data/{wsId}/`), syncing is a native `git push` / `git pull` on that folder.

- **Each workspace syncs independently** to its own remote (or branch on a shared remote).
- **Capture data is never synced** — the `.gitignore` in every workspace excludes `capture/`.
- **No cloud backend required** — any git hosting (GitHub, GitLab, Gitea, a bare repo on a network share) works.
- **No conflict when different entities are edited** — files are per-entity, so two teammates editing different mocks never touch the same file.

**Prerequisites: Plan 00 and Plan 04 must be complete.**

## Architecture

```
Machine A                              Remote (GitHub / bare repo)
────────────────────────────           ──────────────────────────────────
userData/data/ws_abc/                  ws_abc repo
  .git/ ──── git push ──────────────► mocks/root/mock_xyz.json
             git pull ◄───────────── mappings/map_123.json
  mocks/root/mock_xyz.json             ...
  mappings/map_123.json
  capture/   ← .gitignored, never pushed
```

## Sync Behavior

- **What is synced:** All entity files (`mocks/`, `mappings/`, `rules/`, `environments/`, `requests/`, `sockets/`, `workspace.json`, index files).
- **What is never synced:** `capture/` folder (gitignored), `app.json` (global settings, lives outside workspace repos).
- **Conflict model:** File-level last-writer-wins by commit timestamp. Two teammates editing the same mock = conflict. Two teammates editing different mocks = automatic merge, no conflict.

## Data Model Changes

### `WorkspaceMeta` in `src/store/appSettings.ts`

```ts
export interface WorkspaceMeta {
  id: string;
  name: string;
  activeEnvironmentId: string | null;
  syncConfig?: SyncConfig;
  syncMeta?: SyncMeta;
}
```

### `src/sync/types.ts` (new)

```ts
export interface SyncConfig {
  remote: string;   // git remote URL, e.g. "git@github.com:team/workspace-abc.git"
  branch: string;   // e.g. "main"
}

export interface SyncMeta {
  lastPushedAt: number | null;
  lastPulledAt: number | null;
  lastSyncedCommit: string | null;
}
```

`SyncConfig.filePath` from the previous plan is removed — each workspace is its own repo, so there is no "file path within a repo" concept. The whole workspace folder is the repo.

## Implementation Steps

### Step 1 — `src/sync/syncManager.ts` (new)

All push/pull/conflict logic. No Electron coupling — independently testable with a local bare repo.

```ts
import simpleGit from "simple-git";
import { wsDir } from "../store/workspaceFs";
import { queryLog, getEntityAtCommit } from "../store/gitStore";
import { SyncConfig } from "./types";

function git(wsId: string) { return simpleGit(wsDir(wsId)); }

export async function syncPush(wsId: string, cfg: SyncConfig): Promise<{ ok: boolean; commit?: string; error?: string }> {
  try {
    await git(wsId).push(cfg.remote, `HEAD:${cfg.branch}`, ["--set-upstream"]);
    const commit = (await git(wsId).revparse(["HEAD"])).trim();
    return { ok: true, commit };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function syncPull(wsId: string, cfg: SyncConfig, lastSyncedCommit: string | null): Promise<SyncPullResult> {
  try {
    await git(wsId).fetch(cfg.remote, cfg.branch);
    const remoteRef = `${cfg.remote}/${cfg.branch}`;
    const conflicts = await detectConflicts(wsId, remoteRef, lastSyncedCommit);
    if (conflicts.length > 0) return { ok: true, conflicts, appliedCommits: 0 };
    // No conflicts — fast-forward merge
    await git(wsId).merge([remoteRef, "--ff-only"]);
    return { ok: true, conflicts: [], appliedCommits: 1 };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
```

**Conflict detection** uses file-level commit timestamp comparison:

```ts
async function detectConflicts(wsId: string, remoteRef: string, lastSynced: string | null): Promise<EntityConflict[]> {
  const base = lastSynced ?? (await git(wsId).raw(["merge-base", "HEAD", remoteRef])).trim();
  const localLog  = await git(wsId).log({ from: base, to: "HEAD" });
  const remoteLog = await git(wsId).log({ from: base, to: remoteRef });

  // Build map of entityId → most recent commit on each side
  const localByEntity  = buildEntityMap(localLog.all);
  const remoteByEntity = buildEntityMap(remoteLog.all);

  const conflicts: EntityConflict[] = [];
  for (const [entityId, local] of localByEntity) {
    const remote = remoteByEntity.get(entityId);
    if (!remote) continue;  // only local changed
    conflicts.push({
      entityId,
      entityName: local.entityName,
      entity: local.entity,
      localTs: local.ts,
      remoteTs: remote.ts,
      localCommit: local.commit,
      remoteCommit: remote.commit,
      winner: remote.ts >= local.ts ? "remote" : "local",
    });
  }
  return conflicts;
}
```

**Conflict resolution:** For remote-wins entities, read the entity file at `remoteCommit` and write it to the workspace. The local version is already preserved in git history — no extra action needed.

```ts
export async function resolveConflicts(wsId: string, conflicts: EntityConflict[], cfg: SyncConfig): Promise<void> {
  const { writeEntity } = await import("../store/workspaceFs");
  for (const c of conflicts.filter((c) => c.winner === "remote")) {
    const relPath = await findEntityRelPath(wsId, c.entity as AuditEntity, c.entityId);
    if (!relPath) continue;
    const remoteEntity = await getEntityAtCommit(c.remoteCommit, wsId, relPath);
    if (!remoteEntity) continue;
    const parsed = remoteEntity as { folderId?: string | null; id: string };
    writeEntity(wsId, entityKindDir(c.entity)!, c.entityId, parsed, parsed.folderId ?? null);
  }
  await git(wsId).add(".");
  await git(wsId).commit(`sync: resolve ${conflicts.length} conflict(s)`);
  await git(wsId).merge([`${cfg.remote}/${cfg.branch}`, "--no-ff", "--no-edit"]);
}
```

**Deliverable:** Push/pull/conflict detection testable with a local bare repo (no actual remote needed in tests).

---

### Step 2 — IPC handlers for sync

```ts
ipcMain.handle("workspace:sync:push", async (_e, wsId: string) => {
  const settings = loadSettings();
  const ws = settings.workspaces.find((w) => w.id === wsId);
  if (!ws?.syncConfig) return { ok: false, error: "Sync not configured" };
  const result = await syncPush(wsId, ws.syncConfig);
  if (result.ok) {
    ws.syncMeta = { ...ws.syncMeta, lastPushedAt: Date.now(), lastSyncedCommit: result.commit! };
    saveSettings(settings);
  }
  return result;
});

ipcMain.handle("workspace:sync:pull", async (_e, wsId: string) => {
  const settings = loadSettings();
  const ws = settings.workspaces.find((w) => w.id === wsId);
  if (!ws?.syncConfig) return { ok: false, error: "Sync not configured" };
  return syncPull(wsId, ws.syncConfig, ws.syncMeta?.lastSyncedCommit ?? null);
});

ipcMain.handle("workspace:sync:resolve", async (_e, wsId: string, conflicts: EntityConflict[]) => {
  const settings = loadSettings();
  const ws = settings.workspaces.find((w) => w.id === wsId);
  if (!ws?.syncConfig) return { ok: false };
  await resolveConflicts(wsId, conflicts, ws.syncConfig);
  ws.syncMeta = { ...ws.syncMeta, lastPulledAt: Date.now() };
  saveSettings(settings);
  reloadConfig();
  return { ok: true, config: loadConfig() };
});

ipcMain.handle("workspace:sync:saveCfg", (_e, wsId: string, syncConfig: SyncConfig | null) => {
  const settings = loadSettings();
  const ws = settings.workspaces.find((w) => w.id === wsId);
  if (!ws) return { ok: false };
  ws.syncConfig = syncConfig ?? undefined;
  if (!syncConfig) ws.syncMeta = undefined;
  saveSettings(settings);
  return { ok: true };
});
```

---

### Step 3 — `SyncConflictModal` (`renderer/components/SyncConflictModal.tsx`)

Same design as in previous plan. Shows per-entity conflict rows with timestamps and winner indication. On "Apply resolution" calls `window.api.syncResolve(wsId, conflicts)`.

---

### Step 4 — Sync settings in `SettingsPanel`

Per-workspace "Sync" section:
- **Remote URL** input (e.g. `git@github.com:team/workspace-abc.git`).
- **Branch** input (default: `main`).
- **Save** button.
- Setup instructions explaining: create a bare remote, push once to initialize.

No credential fields — delegates to OS git credential helper or SSH agent.

---

### Step 5 — Sync status in `WorkspaceSelector`

Below each workspace name (when `syncConfig` is set):
```
↑ pushed 3m ago  [Push]  [Pull]
```
Push/Pull buttons trigger `syncPush` / `syncPull`. Pull shows `SyncConflictModal` if conflicts are returned.

---

### Step 6 — Auto-sync on save

Add `autoSync?: boolean` to `SyncConfig`. When enabled, `withGitCommit` calls `syncPush` after every commit (fire-and-forget). A failed push emits `sync:error` to the renderer as a toast notification.

## IPC / API Surface

| Channel | Payload | Return |
|---|---|---|
| `workspace:sync:push` | `wsId` | `{ ok, commit?, error? }` |
| `workspace:sync:pull` | `wsId` | `{ ok, conflicts: EntityConflict[], appliedCommits: number, error? }` |
| `workspace:sync:resolve` | `wsId, conflicts` | `{ ok, config? }` |
| `workspace:sync:saveCfg` | `wsId, syncConfig \| null` | `{ ok }` |

## Out of Scope

- Three-way field-level merge (last-writer-wins per entity in v1).
- Syncing version history — only the working tree syncs.
- Central push notification server.
- Git credential management within the app.
- Sync for captures.
