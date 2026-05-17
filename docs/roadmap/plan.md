# Roadmap — Implementation Sequencing

## Phase 0 — Foundation (must ship first, blocks everything)

    └── Plan 00: Folder-Based Data Layer
            Replaces the monolithic config.json with per-workspace folder trees
            and per-workspace git repos. All later plans read/write through this layer.

## Phase 1 — Builds on Phase 0 (can be built in parallel after 00)

    ├── Plan 04: Audit Log
    │       Reads the per-workspace git log. The folder-based layer eliminates the
    │       "save with no changes = spurious commit" bug by removing --allow-empty.
    └── Plan 06: Entity Versioning
            Per-entity file history via `git log <file>`. Revert = write historical
            file content back as current value.

## Phase 2 — Depends on both Phase 1 plans

    └── Plan 01: Shared Config Sync
            Each workspace folder is pushed/pulled as an independent git repo.
            Capture folder excluded via .gitignore.

## Phase 3 — Depends on Plan 01

    └── Plan 02: Read-Only Viewer Seats

## Phase 4 — Depends on Plan 02

    ├── Plan 03: SSO / SAML Provisioning
    └── Plan 05: CLI Headless Mode (largely independent — can ship any time after 00)

---

## Current implementation status

| Plan | Status | Notes |
|---|---|---|
| 00 Folder-Based Data Layer | **Complete** | Per-workspace git repos, per-entity files, adapter layer, migration, all tests green |
| 04 Audit Log | **Complete** | IPC handlers updated; `queryLog` reads per-workspace repo; `audit:diff` uses per-entity relPath; full UI in AuditLogPanel |
| 06 Entity Versioning | **Functional** | Per-entity file history via git log, restore to HEAD, diff view in HistorySidebar; arbitrary revision restore not yet exposed |
| 01 Shared Config Sync | **Functional** | Remote git sync implemented in syncManager.ts + autoSync.ts; push/pull/clone working; auto-sync polling; basic merge fallback; no conflict UI |
| GraphQL Support (P02) | **Complete** | Full request/mock panels, schema introspection, SchemaExplorer, proxy-level mock matching, env var substitution |
| SOAP Support (P03) | **Complete** | Full request/mock panels, WSDL explorer, envelope generation, proxy-level mock matching (SOAPAction + operation name), env var substitution |
| gRPC Support (P04) | **Complete** | Full request/mock panels, ProtoExplorer, server reflection, streaming types, mock server UI; gRPC execution requires @grpc/grpc-js runtime dependency |
| 02 Viewer Seats | Not started | |
| 03 SSO | Not started | |
| 05 CLI | Not started | |

### What exists today (pre-Plan-00)

- `src/store/config.ts` — monolithic `config.json` storing all workspaces' data in one flat file
- `src/store/gitStore.ts` — single shared git repo at `userData/data/` writing `workspaces/{wsId}.json` snapshots
- `src/store/types.ts` — entity interfaces (WorkspaceData, AuditEntry, etc.)
- `src/ipc/handlers.ts` — all mutation handlers with `withGitCommit` wrapper (correct concept, wrong data layer)
- `renderer/panels/AuditLogPanel.tsx` — audit UI (works, minor query-layer changes needed)
- All entity panels — complete and stable
- Tests — unit tests for gitStore and handlers (will need updating after Plan 00)

Plan 00 replaces `gitStore.ts` and the workspace-data parts of `config.ts`. The IPC handlers, renderer panels, and tests carry forward with targeted updates.

---

## Why each dependency exists

- **00 before everything** — All plans that read or write entity data depend on the folder-based layout being in place.
- **04 before 01** — Sync conflict resolution uses per-entity commit timestamps from the audit log to decide which user's version wins.
- **06 before 01** — When sync loses a conflict, the loser's state is preserved via the entity revert path before overwriting.
- **01 before 02** — Viewer seats only make sense once there is shared state to view.
- **02 before 03** — SSO issues a license token that grants roles (admin/viewer). The role system from Plan 02 must exist first.
- **05 is near-independent** — The CLI only needs the data layer (Plan 00) and the proxy server. It can ship any time after Plan 00.
