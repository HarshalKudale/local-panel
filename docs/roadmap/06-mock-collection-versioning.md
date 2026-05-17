# Plan 06: Entity Versioning

## Overview

Every user-editable entity — mocks, mappings, proxy rules, requests, WebSocket connections, environments — has a full version history accessible from its editor. Users can view a field-level diff between any two versions and revert to any earlier state with one click.

Because Plan 00 stores each entity as its own file in a per-workspace git repo, per-entity version history is a native git operation: `git log mocks/root/mock_abc.json`. No extra data structures, no version arrays in `AppConfig`, no storage caps. The entire mutation history is preserved.

**Prerequisite: Plan 00 and Plan 04 must be complete.** This plan adds UI and two new IPC channels on top of the git foundation.

## What Changed vs. the Previous Plan

| Original Plan 06 | Updated |
|---|---|
| `MockVersion[]` stored in `AppConfig` | No extra storage — reads from git per-entity file history |
| 20-version cap enforced by pruning | No cap — git history is complete |
| `CollectionSnapshot[]` in `AppConfig` | Git tags on workspace commits |
| Mock-only scope | All entity types |
| Complex snapshot diff reconstruction | `git log <entity-file>` gives history directly |

## Per-Entity History (the Key Simplification)

After Plan 00, getting the version history of a single mock is:
```
git log mocks/root/mock_abc.json
```

Each commit in that log is an `AuditEntry`. Getting the state at any version:
```
git show <commitHash>:mocks/root/mock_abc.json
```

Reverting = read the historical file content, write it as the current file, commit it. The revert is itself a new commit, making reverts reversible.

## Implementation Steps

### Step 1 — `entity:versions` IPC handler

Returns the commit history for a single entity file.

```ts
ipcMain.handle("entity:versions", async (_e, entityId: string, workspaceId: string, entity: AuditEntity) => {
  // Find the entity's current file path
  const relPath = await findEntityRelPath(workspaceId, entity, entityId);
  if (!relPath) return [];
  // Query the git log filtered to that specific file
  const { entries } = await queryLog({ workspaceId, filePath: relPath, limit: 50 });
  return entries;  // AuditEntry[], newest first
});
```

Add to `src/preload.ts`:
```ts
getEntityVersions: (entityId: string, wsId: string, entity: string) =>
  ipcRenderer.invoke("entity:versions", entityId, wsId, entity),
```

**Deliverable:** Renderer gets the exact version history of one entity file — no unrelated commits included.

---

### Step 2 — `entity:revert` IPC handler

Reads the entity's file content at a historical commit, writes it as the current file, then commits.

```ts
ipcMain.handle("entity:revert", async (_e, opts: {
  commitHash: string;
  entity: AuditEntity;
  entityId: string;
  workspaceId: string;
  revertMessage?: string;
}) => {
  const relPath = await findEntityRelPath(opts.workspaceId, opts.entity, opts.entityId);
  if (!relPath) return { ok: false, error: "Entity file not found" };

  const historical = await getEntityAtCommit(opts.commitHash, opts.workspaceId, relPath);
  if (!historical) return { ok: false, error: "Entity not found at that commit" };

  // Write the historical state back as the current file
  const kind = entityKindDir(opts.entity)!;
  const parsed = historical as { folderId?: string | null; id: string };
  writeEntity(opts.workspaceId, kind, opts.entityId, parsed, parsed.folderId ?? null);

  // Commit the revert
  await commitMutation({
    action: "update",
    entity: opts.entity,
    entityId: opts.entityId,
    entityName: (parsed as any).name ?? opts.entityId,
    workspaceId: opts.workspaceId,
    relPath,
    actor: currentActor(),
    message: opts.revertMessage ?? `revert to ${opts.commitHash.slice(0, 7)}`,
  });

  reloadConfig();
  return { ok: true, entity: historical };
});
```

Add to `src/preload.ts`:
```ts
revertEntity: (opts: unknown) => ipcRenderer.invoke("entity:revert", opts),
```

**Deliverable:** Any entity reverts to any past state. The revert is itself a new commit — reversible.

---

### Step 3 — Optional commit message in entity editors

Entity editors pass an optional human-readable description to the commit. The existing `_commitMessage` pattern on `mock:update` already implements this — extend it to other editors as History tabs are added.

The message appears as a suffix in the commit subject: `update(mock): POST /api/users — Fix auth header`.

---

### Step 4 — `VersionDiff` component (`renderer/components/VersionDiff.tsx`)

Shared field-level diff component. Used by the History tab and the AuditLogPanel.

```tsx
interface VersionDiffProps {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export function VersionDiff({ before, after }: VersionDiffProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const beforeObj = before ?? {};
  const afterObj  = after  ?? {};
  const allKeys   = [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])].filter((k) => !k.startsWith("_"));
  const changed   = allKeys.filter((k) => JSON.stringify(beforeObj[k]) !== JSON.stringify(afterObj[k]));
  const unchanged = allKeys.filter((k) => !changed.includes(k));

  if (!before && !after) return <p className="text-xs text-text-dim">No data available.</p>;
  if (before && !after)  return <p className="text-xs text-text-dim italic">Entity deleted — prior state in git history.</p>;
  if (!before && after)  return <p className="text-xs text-text-dim italic">Entity created — no prior state.</p>;
  if (changed.length === 0) return <p className="text-xs text-text-dim">No field changes detected.</p>;

  const displayKeys = showUnchanged ? allKeys : changed;
  return (
    <div className="flex flex-col gap-1.5 text-xs font-mono">
      {displayKeys.map((k) => {
        const isChanged = changed.includes(k);
        return (
          <div key={k} className={`flex flex-col gap-0.5 ${!isChanged ? "opacity-40" : ""}`}>
            <span className="text-[10px] uppercase text-text-dim tracking-wider">{k}</span>
            <div className="flex gap-2">
              <pre className="flex-1 bg-red/5 border border-red/20 rounded px-2 py-1 text-red line-through opacity-70 whitespace-pre-wrap break-all text-[11px] max-h-32 overflow-y-auto">
                {JSON.stringify(beforeObj[k] ?? null, null, 2)}
              </pre>
              <pre className="flex-1 bg-green/5 border border-green/20 rounded px-2 py-1 text-green whitespace-pre-wrap break-all text-[11px] max-h-32 overflow-y-auto">
                {JSON.stringify(afterObj[k] ?? null, null, 2)}
              </pre>
            </div>
          </div>
        );
      })}
      {unchanged.length > 0 && (
        <button className="text-[10px] text-text-dim underline text-left mt-1 cursor-pointer"
          onClick={() => setShowUnchanged((v) => !v)}>
          {showUnchanged ? `Hide ${unchanged.length} unchanged fields` : `Show ${unchanged.length} unchanged fields`}
        </button>
      )}
    </div>
  );
}
```

Update `AuditLogPanel.tsx` to use this shared component instead of the inline `InlineDiff` function.

**Deliverable:** Single diff component for all entity types, reused everywhere.

---

### Step 5 — History tab in `MockEditorModal`

Add a **History** tab alongside Request and Response tabs.

```tsx
// New state
const [mainTab, setMainTab] = useState<"request" | "response" | "history">("request");
const [versions, setVersions]       = useState<AuditEntry[]>([]);
const [selectedVersion, setSelectedVersion] = useState<AuditEntry | null>(null);
const [diff, setDiff]               = useState<{ before: unknown | null; after: unknown | null } | null>(null);

// Load versions when tab opens
useEffect(() => {
  if (mainTab !== "history" || !initial?.id) return;
  window.api.getEntityVersions(initial.id, initial.workspaceId, "mock").then(setVersions);
}, [mainTab, initial?.id]);

// Load diff when version selected
useEffect(() => {
  if (!selectedVersion) return;
  setDiff(null);
  window.api.auditDiff(selectedVersion.commitHash, selectedVersion.entity, selectedVersion.entityId, selectedVersion.workspaceId)
    .then(setDiff);
}, [selectedVersion?.commitHash]);
```

**History tab layout:** Two-column. Left: scrollable version list (relative time, action badge, optional user message, actor). Right: `VersionDiff` + **Restore this version** button.

On **Restore**: calls `window.api.revertEntity({ commitHash, entity: "mock", entityId, workspaceId })`, then refreshes the editor fields with the returned entity state.

**Deliverable:** Complete version history browseable from the mock editor without leaving the panel.

---

### Step 6 — Collection snapshots via git tags

A "snapshot" is a named git tag on the workspace repo HEAD. No arrays in `AppConfig`.

```ts
// gitStore.ts additions
export async function createSnapshot(wsId: string, name: string): Promise<CollectionSnapshot> {
  const tag = `snapshot/${name.trim().replace(/\s+/g, "-").toLowerCase() || Date.now()}`;
  await getGit(wsId).addAnnotatedTag(tag, `Snapshot: ${name}`);
  const hash = (await getGit(wsId).revparse([tag])).trim();
  return { tag, workspaceId: wsId, name, createdAt: Date.now(), commitHash: hash };
}

export async function listSnapshots(wsId: string): Promise<CollectionSnapshot[]> {
  const tags = await getGit(wsId).tags(["--list", "snapshot/*"]);
  return Promise.all(tags.all.map(async (tag) => {
    const hash = (await getGit(wsId).revparse([tag])).trim();
    const name = tag.replace("snapshot/", "").replace(/-/g, " ");
    return { tag, workspaceId: wsId, name, createdAt: Date.now(), commitHash: hash };
  }));
}

export async function deleteSnapshot(wsId: string, tag: string): Promise<void> {
  await getGit(wsId).raw(["tag", "-d", tag]);
}
```

For **restore snapshot**: read all entity files at the tagged commit and write them back as current files. Commit the restoration.

IPC channels: `snapshot:create`, `snapshot:list`, `snapshot:delete`, `snapshot:restore`.

**Deliverable:** Checkpoint workflow (create, list, restore, delete) using git tags.

---

### Step 7 — Version history for other entity types

Since `entity:versions` and `entity:revert` are generic, version history can be added to any panel. Priority order:

1. **MockEditorModal** — History tab (Step 5, this plan)
2. **RequestsPanel** — History icon per row → `VersionHistoryModal`
3. **MappingsPanel** / **ProxyRulesPanel** / **EnvironmentsPanel** — History icon per row → `VersionHistoryModal`

`VersionHistoryModal` is a shared modal (new `renderer/components/VersionHistoryModal.tsx`) with the same two-column layout as the mock History tab.

**Deliverable:** All entity types have accessible version history.

## IPC / API Surface

| Channel | Payload | Return |
|---|---|---|
| `entity:versions` | `entityId, wsId, entity` | `AuditEntry[]` |
| `entity:revert` | `{ commitHash, entity, entityId, workspaceId, revertMessage? }` | `{ ok: boolean, entity?: unknown }` |
| `snapshot:create` | `wsId, name` | `CollectionSnapshot` |
| `snapshot:list` | `wsId` | `CollectionSnapshot[]` |
| `snapshot:delete` | `wsId, tag` | `{ ok: boolean }` |
| `snapshot:restore` | `wsId, tag` | `{ ok: boolean }` |

## Out of Scope

- Three-way field-level merge within a single entity (last-writer-wins in Plan 01).
- Syncing version history to remote (only the working tree syncs in Plan 01).
- Full-text search across all versions of all entities.
