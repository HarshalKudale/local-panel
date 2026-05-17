# Plan 02: Read-Only Viewer Seats

## Overview

Enterprise teams have "viewer" users who can inspect the current mock and mapping configuration and watch the live capture log, but cannot create, edit, or delete any data. The viewer role is encoded in a signed license key. Both the mutation layer (IPC handlers) and the renderer UI are locked down when the role is `"viewer"`, providing defense-in-depth.

## Prerequisites

- **Plan 01 (Shared Config Sync)** must be in place. Viewers see the shared team state by pulling from the sync backend on launch; without sync, a viewer would only see their own empty local config.
- A way to distribute a public key to all app builds for license verification (embed at build time or bundle with app resources).

## Data Model Changes

### New file: `src/license/types.ts`

```ts
export type LicenseRole = "admin" | "viewer";

export interface LicensePayload {
  teamId: string;
  role: LicenseRole;
  seats: number;
  email: string;
  issuedAt: number;   // Unix timestamp (seconds)
  expiresAt: number;  // Unix timestamp (seconds)
}

/** Stored in userData/license.json */
export interface StoredLicense {
  raw: string;             // original JWT string
  payload: LicensePayload; // decoded, verified payload
  activatedAt: number;     // Date.now() of local activation
}
```

### New file: `src/license/validate.ts`

Parses and verifies the license JWT using RSA-SHA256. The public key is bundled in `resources/license-public-key.pem` at build time.

### `license.json` — new file in `app.getPath("userData")`

Written by `ipcMain.handle("license:activate", ...)`. Separate from `config.json` to avoid accidentally exporting it or polluting workspace sync payloads.

## Implementation Steps

### Step 1 — License type definitions and JWT verification (`src/license/validate.ts`)

**Files:** `src/license/types.ts` (new), `src/license/validate.ts` (new), `resources/license-public-key.pem` (new placeholder)

`validate.ts` exports a single function:

```ts
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

export function verifyLicense(raw: string): LicensePayload {
  // JWT is three base64url segments: header.payload.signature
  const [headerB64, payloadB64, sigB64] = raw.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error("Malformed license key");

  const pubKey = fs.readFileSync(
    path.join(process.resourcesPath ?? app.getAppPath(), "license-public-key.pem"),
    "utf-8"
  );

  const verify = crypto.createVerify("RSA-SHA256");
  verify.update(`${headerB64}.${payloadB64}`);
  const valid = verify.verify(pubKey, Buffer.from(sigB64, "base64url"));
  if (!valid) throw new Error("License signature invalid");

  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as LicensePayload;
  if (Date.now() / 1000 > payload.expiresAt) throw new Error("License expired");
  return payload;
}
```

**Deliverable:** `verifyLicense(jwt)` returns a decoded `LicensePayload` or throws. Independently testable with a self-signed test key.

---

### Step 2 — License store (`src/license/store.ts`)

**Files:** `src/license/store.ts` (new)

```ts
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { StoredLicense } from "./types";

function licensePath(): string {
  return path.join(app.getPath("userData"), "license.json");
}

export function loadLicense(): StoredLicense | null {
  try {
    return JSON.parse(fs.readFileSync(licensePath(), "utf-8")) as StoredLicense;
  } catch { return null; }
}

export function saveLicense(license: StoredLicense): void {
  fs.writeFileSync(licensePath(), JSON.stringify(license, null, 2), "utf-8");
}

export function deleteLicense(): void {
  try { fs.unlinkSync(licensePath()); } catch { /* not present */ }
}
```

**Deliverable:** License state persists across restarts independently of `config.json`.

---

### Step 3 — IPC handlers for license (`src/ipc/handlers.ts`)

**Files:** `src/ipc/handlers.ts`

Add inside `registerIpcHandlers()`:

```ts
ipcMain.handle("license:activate", (_e, raw: string) => {
  try {
    const payload = verifyLicense(raw);
    const stored: StoredLicense = { raw, payload, activatedAt: Date.now() };
    saveLicense(stored);
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

ipcMain.handle("license:get", () => {
  const stored = loadLicense();
  if (!stored) return null;
  // Re-verify on every load to catch expired licenses
  try {
    verifyLicense(stored.raw);
    return stored;
  } catch {
    deleteLicense();
    return null;
  }
});

ipcMain.handle("license:deactivate", () => {
  deleteLicense();
  return { ok: true };
});
```

Add to `src/preload.ts`:

```ts
activateLicense: (raw: string) => ipcRenderer.invoke("license:activate", raw),
getLicense: () => ipcRenderer.invoke("license:get"),
deactivateLicense: () => ipcRenderer.invoke("license:deactivate"),
```

**Deliverable:** Renderer can activate, read, and remove a license key.

---

### Step 4 — Viewer lockdown middleware for IPC (`src/ipc/handlers.ts`)

**Files:** `src/ipc/handlers.ts`

Add a wrapper function at the top of `registerIpcHandlers()`:

```ts
const MUTATING_CHANNELS = new Set([
  "mock:add", "mock:update", "mock:delete",
  "mapping:add", "mapping:update", "mapping:delete",
  "rule:add", "rule:update", "rule:delete",
  "env:add", "env:update", "env:delete", "env:setActive",
  "workspace:add", "workspace:rename", "workspace:delete",
  "request:add", "request:update", "request:delete",
  "ws:add", "ws:update", "ws:delete",
  "folder:add", "folder:rename", "folder:delete",
  "config:save",
]);

function guardViewer(channel: string): void {
  if (!MUTATING_CHANNELS.has(channel)) return;
  const stored = loadLicense();
  if (stored?.payload.role === "viewer") {
    throw new Error("viewer-forbidden");
  }
}
```

Wrap every `ipcMain.handle` registration that mutates data by calling `guardViewer(channelName)` at the top of its handler body. Keep the call to `guardViewer` as the very first line so it throws before any `loadConfig()` call.

**Deliverable:** A viewer's IPC calls to all mutation channels return an error without touching config.

---

### Step 5 — `LicenseContext` in the renderer (`renderer/lib/LicenseContext.tsx`)

**Files:** `renderer/lib/LicenseContext.tsx` (new)

```tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { LicensePayload } from "../../src/license/types";  // or redeclare locally in renderer/types.ts

interface LicenseState {
  role: "admin" | "viewer" | "none";
  isViewer: boolean;
  payload: LicensePayload | null;
}

const LicenseContext = createContext<LicenseState>({ role: "none", isViewer: false, payload: null });

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LicenseState>({ role: "none", isViewer: false, payload: null });

  useEffect(() => {
    window.api.getLicense().then((stored) => {
      if (!stored) return;
      setState({
        role: stored.payload.role,
        isViewer: stored.payload.role === "viewer",
        payload: stored.payload,
      });
    });
  }, []);

  return <LicenseContext.Provider value={state}>{children}</LicenseContext.Provider>;
}

export function useIsViewer(): boolean {
  return useContext(LicenseContext).isViewer;
}

export function useLicense(): LicenseState {
  return useContext(LicenseContext);
}
```

Wrap `<App />` in `renderer/main.tsx` with `<LicenseProvider>`.

**Deliverable:** Any component can call `useIsViewer()` to know whether to render read-only UI.

---

### Step 6 — UI lockdown: disable all edit controls for viewers

**Files:** `renderer/panels/MocksPanel.tsx`, `renderer/panels/MappingsPanel.tsx`, `renderer/panels/ProxyRulesPanel.tsx`, `renderer/panels/EnvironmentsPanel.tsx`, `renderer/panels/SettingsPanel.tsx`, `renderer/components/MockEditorModal.tsx`

In each panel:

1. Call `const isViewer = useIsViewer();` at the top of the component.
2. Disable all "Add", "Save", "Delete", "Update" buttons: add `disabled={isViewer}` and `title={isViewer ? "View only — upgrade to edit" : undefined}`.
3. In `MockEditorModal`, when `isViewer` is true, render all inputs as `readOnly` and replace the Save button with a `View Only` label.
4. In `MocksPanel`, suppress the `+` new-tab button and the import button.

This is pure UI — the IPC guard (Step 4) is the authoritative enforcement.

**Deliverable:** Viewers see all data but cannot interact with any edit surface.

---

### Step 7 — "View Only" badge in `TitleBar`

**Files:** `renderer/components/TitleBar.tsx`

Import `useLicense`. When `role === "viewer"`, render a small badge to the right of the app name:

```tsx
{isViewer && (
  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-yellow/10 text-yellow border border-yellow/20">
    View Only
  </span>
)}
```

**Deliverable:** Role is immediately visible from any panel; no confusion about why edits are disabled.

---

### Step 8 — License activation UI in `SettingsPanel`

**Files:** `renderer/panels/SettingsPanel.tsx`

Add a "License" `<section>` block after the "About" section. Contents:

- When no license is active: a `<textarea>` for pasting the license JWT, a **Activate** button, and an error/success inline message.
- When a license is active: shows `teamId`, `role`, expiry date, and a **Deactivate** button (calls `window.api.deactivateLicense()` then refreshes the context).

On successful activation, call `window.api.activateLicense(raw)` and then update `LicenseContext` by re-fetching via `window.api.getLicense()`.

**Deliverable:** Admin and viewer users can self-serve license activation without a separate installer.

---

### Step 9 — Viewer capture panel: pull-backed read-only log

**Files:** `renderer/panels/CapturePanel.tsx`

`CapturePanel` currently reads from `localStorage` (keyed by `capture:entries:${workspaceId}`). This is local-only data.

For viewers, instead of showing an empty local capture log, add a "Refresh" button that calls `window.api.syncPull(workspaceId)` (requires Plan 01) to fetch the latest workspace snapshot. The viewer's capture panel shows a banner: "Captures are local — this feed shows the last synced state from your team." The panel itself remains read-only (no export, no "Create Mock from capture" button).

When `isViewer` is true, hide the "Create Mock" and "Open in Requests" action buttons on each capture entry row.

**Deliverable:** Viewers get meaningful data from the shared sync state rather than a blank local log.

---

### Step 10 — Seat enforcement (scope: future)

This step is intentionally deferred. Tracking active install count requires a server-side seat-counting endpoint not yet defined. The `seats` field is stored in the license payload and is available for a future enforcement step.

## IPC / API Surface

| Channel | Direction | Payload | Return |
|---|---|---|---|
| `license:activate` | renderer → main | `raw: string` (JWT) | `{ ok: boolean, payload?: LicensePayload, error?: string }` |
| `license:get` | renderer → main | — | `StoredLicense \| null` |
| `license:deactivate` | renderer → main | — | `{ ok: true }` |

New `window.api` methods in `src/preload.ts`: `activateLicense`, `getLicense`, `deactivateLicense`.

## UI Components

| Component | Status | Notes |
|---|---|---|
| `renderer/lib/LicenseContext.tsx` | New | React context + hooks `useIsViewer`, `useLicense` |
| `renderer/main.tsx` | Modified | Wrap `<App>` with `<LicenseProvider>` |
| `renderer/components/TitleBar.tsx` | Modified | "View Only" badge when `role === "viewer"` |
| `renderer/panels/SettingsPanel.tsx` | Modified | New "License" section for activation/deactivation |
| `renderer/panels/MocksPanel.tsx` | Modified | Disable add/import/save/delete when viewer |
| `renderer/panels/MappingsPanel.tsx` | Modified | Disable all edit controls when viewer |
| `renderer/panels/ProxyRulesPanel.tsx` | Modified | Disable all edit controls when viewer |
| `renderer/panels/EnvironmentsPanel.tsx` | Modified | Disable all edit controls when viewer |
| `renderer/components/MockEditorModal.tsx` | Modified | All inputs `readOnly`, Save button hidden when viewer |
| `renderer/panels/CapturePanel.tsx` | Modified | Hide action buttons; add sync-pull refresh for viewers |

## Testing Notes

- **Step 1:** Generate a test RSA key pair. Sign a test JWT with the private key. Assert `verifyLicense` succeeds. Tamper with the payload byte and assert it throws. Set `expiresAt` in the past and assert it throws.
- **Step 4:** Call a mutating IPC channel from a test harness with a viewer license stored. Assert the returned error is `"viewer-forbidden"`. Assert `loadConfig()` was not called (use a spy).
- **Step 5:** Mount `<LicenseProvider>` in a test with `window.api.getLicense` mocked to return a viewer payload. Assert `useIsViewer()` returns `true`.
- **Step 6:** Mount `MocksPanel` inside `<LicenseProvider>` with viewer role. Assert all buttons with `data-testid="mock-add"` are `disabled`. Assert `MockEditorModal` inputs have `readOnly`.
- **Step 8:** Enter a valid JWT in the activation textarea, click Activate, mock `window.api.activateLicense` to return `{ ok: true }`. Assert the active license section renders the team ID.
- **End-to-end:** Fresh install with no `license.json` — all edit controls enabled. Activate a viewer license, reload; assert controls are disabled and badge is visible. Deactivate; assert controls re-enable.

## Out of Scope

- SSO-based license issuance (Plan 03 covers this).
- Server-side seat counting and enforcement (Step 10, explicitly deferred).
- Role-based access within a single workspace at the mock or folder level (all-or-nothing viewer lockdown only).
- License renewal flow (re-activation via the same Settings UI is sufficient).
- Offline grace period for expired licenses.
