# Plan 03: SSO / SAML Provisioning

## Overview

Enterprise customers configure their identity provider (Okta, Azure AD, Google Workspace) once. When an employee opens Local Panel, the app detects an enterprise bundle, redirects to the company SSO login page, and automatically mints a license token scoped to the user's identity and role — replacing the manual license key flow from Plan 02. This removes the per-seat key distribution problem for large teams.

## Prerequisites

- **Plan 02 (Read-only Viewer Seats)** must be fully implemented. SSO provisions a license that is stored in `license.json` and verified by `src/license/validate.ts` using the same RSA path. The `verifyLicense` function, `StoredLicense` type, and IPC handlers `license:get` / `license:activate` are all reused.
- A custom URL scheme (`local-panel://`) must be registered in the Electron app's OS manifest (handled in Step 4).
- The `node-saml` npm package must be available.

## Data Model Changes

### New file: `src/enterprise/types.ts`

```ts
/** Stored in userData/enterprise.json — distributed by IT admin */
export interface EnterpriseConfig {
  version: 1;
  teamId: string;
  teamName: string;
  /** IDP SAML metadata URL — used to fetch XML and extract SSO URL + cert */
  metadataUrl: string;
  /** SP Entity ID registered in the IDP */
  entityId: string;
  /** RSA public key in PEM format for license JWT verification */
  licensePublicKey: string;
  /** Optional: role attribute name in SAML assertion, default "local-panel-role" */
  roleAttribute?: string;
}
```

### New file: `src/enterprise/store.ts`

Functions `loadEnterpriseConfig()` / `saveEnterpriseConfig()` that read/write `userData/enterprise.json`. No changes to `AppConfig` or `config.json`.

### Changes to `src/license/validate.ts`

`verifyLicense` currently reads the public key from `resources/license-public-key.pem`. Extend it to also accept the key from `enterprise.json`:

```ts
export function verifyLicense(raw: string, overridePublicKey?: string): LicensePayload
```

When `overridePublicKey` is supplied, use that instead of the bundled file. `src/ipc/handlers.ts` passes `enterprise.licensePublicKey` when validating SSO-issued tokens.

## Implementation Steps

### Step 1 — Enterprise config types and store

**Files:** `src/enterprise/types.ts` (new), `src/enterprise/store.ts` (new)

`loadEnterpriseConfig()` reads `userData/enterprise.json` and returns `EnterpriseConfig | null`. `saveEnterpriseConfig(cfg)` writes it. No Electron dialog involved; the file is dropped by IT admins via MDM or manual copy.

**Deliverable:** Main process can detect the presence of an enterprise bundle on startup.

---

### Step 2 — IPC handler for enterprise config management

**Files:** `src/ipc/handlers.ts`

```ts
ipcMain.handle("enterprise:get", () => loadEnterpriseConfig());

ipcMain.handle("enterprise:import", async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: "Import Enterprise Bundle",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (canceled || filePaths.length === 0) return { ok: false };
  try {
    const raw = fs.readFileSync(filePaths[0], "utf-8");
    const cfg = JSON.parse(raw) as EnterpriseConfig;
    if (cfg.version !== 1 || !cfg.metadataUrl || !cfg.entityId) {
      return { ok: false, error: "Not a valid enterprise bundle" };
    }
    saveEnterpriseConfig(cfg);
    return { ok: true, config: cfg };
  } catch {
    return { ok: false, error: "Could not parse enterprise bundle" };
  }
});
```

Add to `src/preload.ts`:

```ts
getEnterprise: () => ipcRenderer.invoke("enterprise:get"),
importEnterprise: () => ipcRenderer.invoke("enterprise:import"),
```

**Deliverable:** Admins can import an enterprise bundle via a file picker or by dropping `enterprise.json` into `userData`.

---

### Step 3 — Custom URL scheme registration (`src/main.ts`)

**Files:** `src/main.ts`, `package.json` (electron-builder config)

In `src/main.ts`, register the custom protocol before `app.whenReady()`:

```ts
if (process.defaultApp) {
  // Dev mode: register for the current executable
  app.setAsDefaultProtocolClient("local-panel", process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient("local-panel");
}
```

In `electron-builder` config (in `package.json` or `electron-builder.yml`), add:

```json
"protocols": [
  { "name": "Local Panel SSO", "schemes": ["local-panel"] }
]
```

On macOS, handle `open-url` event:

```ts
app.on("open-url", (_event, url) => {
  handleSsoCallback(url);
});
```

On Windows, the URL arrives as a command-line argument. Add to `app.whenReady()`:

```ts
const argv = process.argv.slice(1);
const deepLink = argv.find((a) => a.startsWith("local-panel://"));
if (deepLink) handleSsoCallback(deepLink);
```

**Deliverable:** `local-panel://auth/callback?SAMLResponse=...` is delivered to the running Electron process.

---

### Step 4 — SAML Service Provider: AuthnRequest generation (`src/saml/sp.ts`)

**Files:** `src/saml/sp.ts` (new). Install `node-saml` as a production dependency.

```ts
import { ServiceProvider } from "node-saml";
import { EnterpriseConfig } from "../enterprise/types";

export function makeSp(enterprise: EnterpriseConfig): ServiceProvider {
  return new ServiceProvider({
    entityID: enterprise.entityId,
    assertionConsumerServiceUrl: "local-panel://auth/callback",
    // node-saml needs the IDP cert — fetched separately via metadataUrl
  });
}

export async function fetchIdpMetadata(metadataUrl: string): Promise<{ ssoUrl: string; cert: string }> {
  // Fetch XML using node's https.get, parse with DOMParser or fast-xml-parser
  // Return the SingleSignOnService URL and X509Certificate
}

export async function buildAuthnRequestUrl(enterprise: EnterpriseConfig): Promise<string> {
  const { ssoUrl, cert } = await fetchIdpMetadata(enterprise.metadataUrl);
  const sp = makeSp(enterprise);
  // node-saml: sp.createLoginRequestUrl(idpSsoUrl, options)
  const { context: authnUrl } = await sp.createLoginRequestUrl(ssoUrl, {});
  return authnUrl;
}
```

**Deliverable:** The app can generate a well-formed SAML AuthnRequest URL for any SAML 2.0 IDP.

---

### Step 5 — IPC handler to initiate SSO login (`src/ipc/handlers.ts`)

**Files:** `src/ipc/handlers.ts`

```ts
ipcMain.handle("sso:initiate", async () => {
  const enterprise = loadEnterpriseConfig();
  if (!enterprise) return { ok: false, error: "No enterprise bundle" };
  try {
    const url = await buildAuthnRequestUrl(enterprise);
    const { shell } = require("electron");
    shell.openExternal(url);  // opens system browser to IDP login page
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});
```

Add to `src/preload.ts`:

```ts
ssoInitiate: () => ipcRenderer.invoke("sso:initiate"),
onSsoComplete: (cb: (result: { ok: boolean; error?: string }) => void) => {
  const handler = (_: unknown, result: unknown) => cb(result as { ok: boolean; error?: string });
  ipcRenderer.on("sso:complete", handler);
  return () => ipcRenderer.off("sso:complete", handler);
},
```

**Deliverable:** Clicking "Login with SSO" opens the default browser at the IDP login page.

---

### Step 6 — SAML Response handling (`src/saml/sp.ts`, `src/main.ts`)

**Files:** `src/saml/sp.ts`, `src/main.ts`

Add to `src/saml/sp.ts`:

```ts
export async function validateSamlResponse(
  enterprise: EnterpriseConfig,
  samlResponse: string   // base64-encoded SAMLResponse from callback URL
): Promise<{ email: string; role: LicenseRole; teamId: string }> {
  const { cert } = await fetchIdpMetadata(enterprise.metadataUrl);
  const sp = makeSp(enterprise);
  const profile = await sp.validatePostResponse({ SAMLResponse: samlResponse });

  const roleAttr = enterprise.roleAttribute ?? "local-panel-role";
  const rawRole  = profile.attributes?.[roleAttr] as string | undefined;
  const role: LicenseRole = rawRole === "viewer" ? "viewer" : "admin";
  return { email: profile.nameID ?? "", role, teamId: enterprise.teamId };
}
```

In `src/main.ts`, add the callback handler (called from the `open-url` event and Windows `argv` path wired in Step 3):

```ts
async function handleSsoCallback(url: string): Promise<void> {
  const u = new URL(url);
  const samlResponse = u.searchParams.get("SAMLResponse");
  if (!samlResponse) return;

  const enterprise = loadEnterpriseConfig();
  if (!enterprise) return;

  try {
    const { email, role, teamId } = await validateSamlResponse(enterprise, samlResponse);
    // Mint a local JWT signed with the enterprise private key (held server-side)
    // For local-only verification, store a self-signed token using the enterprise public key
    const payload: LicensePayload = {
      teamId, role, seats: 1, email,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 8 * 3600, // 8 hours
    };
    // The token is signed server-side — here we receive it from the SAML attributes
    // or from a thin token-minting endpoint (see Out of Scope note)
    const stored: StoredLicense = { raw: "", payload, activatedAt: Date.now() };
    saveLicense(stored);
    getMainWindow()?.webContents.send("sso:complete", { ok: true });
  } catch (e) {
    getMainWindow()?.webContents.send("sso:complete", { ok: false, error: (e as Error).message });
  }
}
```

Note: For a production deployment, the SAML assertion should be exchanged at a thin server-side token endpoint that mints and signs the JWT. The client receives the signed JWT in the callback URL or from the endpoint. This avoids the app ever needing the private signing key.

**Deliverable:** A complete SSO round-trip: browser opens IDP → user authenticates → browser redirects to `local-panel://auth/callback` → app validates SAML response → license is stored.

---

### Step 7 — First-launch SSO gate (`src/main.ts`)

**Files:** `src/main.ts`

In `app.whenReady()`, before calling `createWindow()`, add:

```ts
const enterprise = loadEnterpriseConfig();
const license    = loadLicense();

if (enterprise) {
  let licenseValid = false;
  if (license) {
    try { verifyLicense(license.raw, enterprise.licensePublicKey); licenseValid = true; }
    catch { deleteLicense(); }
  }
  if (!licenseValid) {
    // Show a minimal splash window with a "Login with SSO" button
    createSsoSplashWindow();  // see renderer/SsoSplash.tsx
    return;  // main window created after sso:complete event
  }
}
// Normal startup
createWindow();
```

`createSsoSplashWindow()` opens a small frameless `BrowserWindow` loading `renderer/sso-splash.html`. After `sso:complete` is received, the splash closes and `createWindow()` is called.

**Deliverable:** Users without a valid license on an enterprise machine see only the SSO login screen, not the main app.

---

### Step 8 — SSO splash window and renderer (`renderer/SsoSplash.tsx`)

**Files:** `renderer/SsoSplash.tsx` (new), `renderer/sso-splash.html` (new webpack entry)

A minimal React component:
- Displays the `teamName` from `enterprise.json` and a "Login with [teamName] SSO" button.
- On click, calls `window.api.ssoInitiate()` and shows a "Waiting for authentication in your browser..." spinner.
- Listens to `window.api.onSsoComplete(result => ...)`. On `result.ok`, the main process closes this window and opens the main window. On failure, shows an error message with a retry button.
- A "Use manual license key instead" fallback link navigates to the license activation screen (requires Plan 02 SettingsPanel to be accessible — open the main window at the settings panel instead).

**Deliverable:** Clean UX gate for enterprise users with no Electron boilerplate visible.

---

### Step 9 — Token refresh on app focus

**Files:** `src/main.ts`

```ts
app.on("browser-window-focus", async () => {
  const enterprise = loadEnterpriseConfig();
  if (!enterprise) return;
  const license = loadLicense();
  if (!license) return;
  // Check expiry: if within 15 minutes of expiry, re-trigger SSO silently
  const remaining = license.payload.expiresAt - Math.floor(Date.now() / 1000);
  if (remaining < 15 * 60) {
    const url = await buildAuthnRequestUrl(enterprise);
    shell.openExternal(url);
  }
});
```

**Deliverable:** Long-running sessions re-authenticate before the token expires without requiring a full restart.

---

### Step 10 — Fallback: manual license key when no enterprise config

**Files:** `renderer/panels/SettingsPanel.tsx`

No code changes needed — the License section from Plan 02 Step 8 continues to work. When `enterprise.json` is absent, `ipcMain.handle("sso:initiate")` returns `{ ok: false, error: "No enterprise bundle" }`, and the settings panel shows the manual key input as the only option.

Add a note in the Settings License section: "To enable SSO, ask your IT administrator to deploy an enterprise bundle (`enterprise.json`) to your Local Panel data folder."

**Deliverable:** Teams without enterprise SSO are unaffected.

## IPC / API Surface

| Channel | Direction | Payload | Return |
|---|---|---|---|
| `enterprise:get` | renderer → main | — | `EnterpriseConfig \| null` |
| `enterprise:import` | renderer → main | — | `{ ok: boolean, config?: EnterpriseConfig, error?: string }` |
| `sso:initiate` | renderer → main | — | `{ ok: boolean, error?: string }` |
| `sso:complete` | main → renderer | `{ ok: boolean, error?: string }` | event (no return) |

Reused from Plan 02: `license:get`, `license:activate`, `license:deactivate`.

New `window.api` methods in `src/preload.ts`: `getEnterprise`, `importEnterprise`, `ssoInitiate`, `onSsoComplete`.

## UI Components

| Component | Status | Notes |
|---|---|---|
| `renderer/SsoSplash.tsx` | New | Minimal first-launch SSO gate window |
| `renderer/sso-splash.html` | New | Webpack entry for splash window |
| `renderer/panels/SettingsPanel.tsx` | Modified | Enterprise bundle import UI in License section |

## Testing Notes

- **Step 1:** Assert `loadEnterpriseConfig()` returns `null` when file is absent; returns parsed object when present.
- **Step 4:** Use a known Okta test tenant metadata URL. Assert `buildAuthnRequestUrl` returns a URL containing `SAMLRequest=` query parameter.
- **Step 5:** Mock `shell.openExternal`. Call `sso:initiate` via IPC. Assert `openExternal` was called with a URL matching `^https://`.
- **Step 6:** Construct a test SAML response using `node-saml`'s test utilities. Feed it to `validateSamlResponse` with a test IDP cert. Assert the returned role matches the attribute in the assertion.
- **Step 7:** Write an integration test that stubs `loadLicense()` to return `null` and `loadEnterpriseConfig()` to return a fixture. Assert that `createWindow()` is NOT called and `createSsoSplashWindow()` IS called.
- **Step 9:** Stub `license.payload.expiresAt` to `now + 300s`. Focus the main window. Assert `shell.openExternal` is called within 1s.

## Out of Scope

- The server-side token-minting endpoint that signs the JWT after SAML assertion validation. This is required for production but is a separate backend service not part of the Electron codebase.
- OIDC / OAuth 2.0 support (SAML 2.0 only in this plan).
- Just-in-time (JIT) workspace provisioning: automatically creating workspaces based on IDP group membership.
- Admin dashboard for managing enterprise configurations (web app, separate service).
- SCIM user provisioning for automatic deprovisioning when an employee leaves.
- Cross-platform custom scheme deep-linking on Linux (requires `.desktop` file registration, deferred).
