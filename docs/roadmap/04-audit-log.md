# Plan 04: Audit Log

## Overview

Every mutation to any user-editable entity (mocks, mappings, proxy rules, requests, WebSocket connections, environments, folders, workspaces) is recorded as a **git commit** in the workspace's per-entity git repo (Plan 00). The commit log is the audit trail. No separate `audit.json` file, no `--allow-empty` commits, no spurious entries when saving unchanged data.

**Prerequisite: Plan 00 (Folder-Based Data Layer) must be implemented first.** This plan is purely additive on top of that foundation — it exposes the existing git history through an IPC API and a UI panel.

## What Changed vs. the Previous Implementation

The partial implementation that exists today (`src/store/gitStore.ts`, `renderer/panels/AuditLogPanel.tsx`, `src/ipc/handlers.ts` audit channels) was built against a single-file-per-workspace git approach. After Plan 00, the data layer works differently:

| Old (current, broken) | New (after Plan 00) |
|---|---|
| Single shared git repo at `userData/data/` | Per-workspace git repo at `userData/data/{wsId}/` |
| Commits a full `workspaces/{wsId}.json` snapshot | Commits the specific entity file that changed |
| `--allow-empty` to always create a commit | No commit when file content is unchanged (spurious-commit fix) |
| `queryLog` reads one repo with a path filter | `queryLog(wsId, ...)` reads the workspace's own repo |
| `getEntityAtCommit` reads `workspaces/{wsId}.json` at a commit | `getEntityAtCommit(wsId, relPath, commitRef)` reads the specific entity file |
| `writeWorkspaceSnapshot` writes a JSON blob | Not needed — Plan 00 handlers write entity files directly |

The `AuditLogPanel.tsx` component and the IPC channel signatures (`audit:list`, `audit:diff`, `audit:export`) do not change.

## Architecture (after Plan 00)

```
userData/data/{wsId}/
  .git/                          ← workspace-scoped git repo
  mocks/root/mock_abc.json       ← committed on mock:update
  mocks/root/mock_xyz.json       ← committed on mock:add
  mappings/map_123.json          ← committed on mapping:add
  ...

git log (per workspace):
  update(mock): POST /api/users         ← reads mocks/root/mock_abc.json diff
  create(mapping): api.localhost
  delete(mock): GET /api/orders
```

Each commit touches exactly one file. The git diff between two commits for a specific mock is the exact change made to that mock — no noise from other entities.

## Prerequisites

- **Plan 00 must be complete** — workspace folders, per-entity files, per-workspace git repos, `withGitCommit` with `relPath`, and `commitMutation` that skips unchanged files.
- `simple-git` npm package (already installed).
- System git ≥ 2.23 installed on the host machine.

## Implementation Steps

### Step 1 — Update `queryLog` in `src/store/gitStore.ts`

Already implemented in Plan 00's Step 3. `queryLog(opts: QueryLogOptions)` now requires `workspaceId` and operates on the workspace-specific git repo. No changes needed to the function signature from the renderer's perspective.

**Deliverable:** `queryLog({ workspaceId: "ws1", entity: "mock" })` queries only that workspace's git history.

---

### Step 2 — Update `getEntityAtCommit` in `src/store/gitStore.ts`

Plan 00's `getEntityAtCommit(commitRef, wsId, relPath)` reads a specific entity file from a historical commit. Plan 04 needs a thin wrapper that can look up `relPath` from an `AuditEntry` when the caller only has the entity ID:

```ts
export async function getEntityByIdAtCommit(
  commitRef: string,
  wsId: string,
  entity: AuditEntity,
  entityId: string,
): Promise<unknown | null> {
  // Find the entity's file by scanning the current workspace for its relPath,
  // then reading that path at the given commit.
  // If the entity no longer exists (deleted), use the commit's own tree to find it.
  const relPath = await findEntityRelPath(wsId, entity, entityId);
  if (!relPath) return null;
  return getEntityAtCommit(commitRef, wsId, relPath);
}

async function findEntityRelPath(wsId: string, entity: AuditEntity, entityId: string): Promise<string | null> {
  // Try current filesystem first (entity still exists)
  const kind = entityKindDir(entity);  // "mocks", "mappings", etc.
  if (!kind) return null;
  const dir = path.join(wsDir(wsId), kind);
  // Scan for a file named {entityId}.json in any subfolder
  for (const subdir of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!subdir.isDirectory()) continue;
    const candidate = path.join(dir, subdir.name, `${entityId}.json`);
    if (fs.existsSync(candidate)) {
      return `${kind}/${subdir.name}/${entityId}.json`;
    }
  }
  return null;
}

function entityKindDir(entity: AuditEntity): string | null {
  const map: Partial<Record<AuditEntity, string>> = {
    mock: "mocks", mapping: "mappings", rule: "rules",
    request: "requests", wsConnection: "sockets", environment: "environments",
  };
  return map[entity] ?? null;
}
```

**Deliverable:** `audit:diff` can reconstruct before/after for any entity from git history.

---

### Step 3 — `audit:list` IPC handler (update)

The existing handler works but calls the old `queryLog` signature. After Plan 00, update to pass `workspaceId` explicitly (it was already required in the new signature):

```ts
ipcMain.handle("audit:list", async (_e, opts: QueryLogOptions = {}) => {
  if (!opts.workspaceId) {
    const cfg = loadConfig();
    opts = { ...opts, workspaceId: cfg.activeWorkspaceId };
  }
  return queryLog(opts);
});
```

No change to the IPC channel name or the renderer's `window.api.listAudit(opts)` call.

**Deliverable:** Renderer fetches paginated, filtered audit entries from the workspace's git history.

---

### Step 4 — `audit:diff` IPC handler (update)

Replace `getEntityAtCommit` (old blob-based) with `getEntityByIdAtCommit` (new file-based):

```ts
ipcMain.handle("audit:diff", async (_e, commitHash: string, entity: AuditEntity, entityId: string, workspaceId: string) => {
  const after  = await getEntityByIdAtCommit(commitHash,        workspaceId, entity, entityId);
  const before = await getEntityByIdAtCommit(`${commitHash}~1`, workspaceId, entity, entityId);
  return { before, after };
});
```

No change to the IPC channel name or the renderer's `window.api.auditDiff(...)` call.

**Deliverable:** Before/after snapshots retrieved from per-entity file history at specific commits.

---

### Step 5 — `audit:export` IPC handler

No changes needed — already implemented correctly. Calls `queryLog({ limit: 0, workspaceId })` and serializes to JSON or CSV.

---

### Step 6 — `AuditLogPanel.tsx` (no changes needed)

The existing `renderer/panels/AuditLogPanel.tsx` is complete and correct. It calls `window.api.listAudit(opts)`, `window.api.auditDiff(...)`, and `window.api.exportAudit(format)` — all of which continue to work after the gitStore update.

The only thing to verify: the panel passes `activeWorkspaceId` in the `opts` to `listAudit`. It currently does — `opts.workspaceId = activeWorkspaceId` is set in the `load` callback.

**Deliverable:** No UI changes needed. Audit Log panel works correctly after Plan 00 is in place.

---

### Step 7 — Remove `writeWorkspaceSnapshot` from handlers

After Plan 00, `withGitCommit` no longer calls `writeWorkspaceSnapshot`. Remove:
- The `writeWorkspaceSnapshot` export from `gitStore.ts`
- The `configToWorkspaceData` helper in `handlers.ts`
- The `writeWorkspaceSnapshot` import in `handlers.ts`

These were workarounds for the old single-file approach.

**Deliverable:** Cleaner handler code with no workspace-snapshot write before each commit.

---

### Step 8 — Update tests

`tests/store/gitStore.test.ts` needs updates for the new per-workspace layout:

1. Replace `setDataDirOverride(tmpDir)` with `setDataRootOverride(tmpDir)`.
2. Call `initWorkspaceDir(wsId, "test")` before `initWorkspaceRepo(wsId)`.
3. Helpers write individual entity files (`writeEntity(wsId, "mocks", id, data)`) instead of a single workspace JSON.
4. `commitMutation` calls include `relPath`.
5. Add a test: save identical content twice → assert only one commit created (the spurious-commit fix).

`tests/ipc/handlers.test.ts` needs the `workspaceFs` module mocked alongside `gitStore`.

**Deliverable:** All existing gitStore tests pass with the new layout. New test covers the no-spurious-commit behavior.

## IPC / API Surface

No changes to channel names or return types from the renderer's perspective:

| Channel | Direction | Payload | Return |
|---|---|---|---|
| `audit:list` | renderer → main | `QueryLogOptions` | `{ entries: AuditEntry[], total: number }` |
| `audit:diff` | renderer → main | `commitHash, entity, entityId, wsId` | `{ before: unknown \| null, after: unknown \| null }` |
| `audit:export` | renderer → main | `format: "json" \| "csv"` | `{ ok: boolean }` |

`window.api` methods: `listAudit`, `auditDiff`, `exportAudit` — unchanged.

## What No Longer Needs to Be Done (Already Implemented)

- `AuditLogPanel.tsx` component — complete
- Nav entry in `App.tsx` — complete
- `audit:list` / `audit:diff` / `audit:export` IPC channels — complete (need minor update for new gitStore)
- `preload.ts` bindings — complete
- `ClipboardList` icon — complete
- Git startup check in `main.ts` — complete
- `withGitCommit` wrapper concept — complete (needs update for `relPath` in Plan 00 Step 6)

## Out of Scope

- Audit entries for captures (transient traffic, not configuration mutations).
- Tamper-evident audit (cryptographic chaining beyond git's SHA integrity).
- Real-time audit streaming.
- Role-based access to the audit log (Plan 02).
- Bundling a portable git binary.
