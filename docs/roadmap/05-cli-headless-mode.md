# Plan 05: CLI Headless Mode

## Overview

A `local-panel` CLI starts the proxy server, loads a workspace config, and streams capture logs without launching Electron. The primary use case is CI pipelines that need to mock external APIs during integration test runs. All existing proxy and mock logic in `src/proxy/` is reused directly — none of it imports Electron. The main blockers are the `app.getPath` coupling in `src/store/config.ts` and the renderer-side `localStorage` capture store, both of which this plan resolves.

## Prerequisites

- `src/proxy/server.ts` and `src/proxy/mockHandler.ts` must not import anything from `electron`. Currently only `src/store/config.ts` imports `electron` (for `app.getPath`) and `src/ipc/handlers.ts` and `src/main.ts`. The CLI will not load `handlers.ts` or `main.ts` at all.
- `commander` or `yargs` must be added as a production dependency (this plan uses `commander`).
- A separate webpack/esbuild target must be added for the CLI bundle (no renderer, no Electron preload).

## Data Model Changes

### New file: `src/store/captureStore.ts`

Captures currently live entirely in renderer `localStorage` (`capture:entries:${workspaceId}`). This file moves persistence to the main process, making captures accessible to both the Electron renderer (via IPC) and the CLI.

```ts
import * as fs from "fs";
import * as path from "path";
import { RequestLogEntry } from "../proxy/server";

const MAX_ENTRIES = 200;

let dataDir: string;

export function initCaptureStore(dir: string): void {
  dataDir = dir;
  fs.mkdirSync(dir, { recursive: true });
}

function capturePath(workspaceId: string): string {
  return path.join(dataDir, `captures-${workspaceId}.json`);
}

export function appendCapture(workspaceId: string, entry: RequestLogEntry): void {
  const p = capturePath(workspaceId);
  let entries: RequestLogEntry[] = [];
  try { entries = JSON.parse(fs.readFileSync(p, "utf-8")); } catch { /* first write */ }
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
  fs.writeFileSync(p, JSON.stringify(entries, null, 2), "utf-8");
}

export function loadCaptures(workspaceId: string): RequestLogEntry[] {
  try { return JSON.parse(fs.readFileSync(capturePath(workspaceId), "utf-8")); }
  catch { return []; }
}

export function clearCaptures(workspaceId: string): void {
  const p = capturePath(workspaceId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
```

### Changes to `src/store/config.ts`

Extract the hard-coded `app.getPath("userData")` into an overridable function:

```ts
// Before:
function getConfigPath(): string {
  if (!configPath) configPath = path.join(app.getPath("userData"), "config.json");
  return configPath;
}

// After:
let configPathOverride: string | null = null;

export function setConfigPath(p: string): void {
  configPathOverride = p;
}

function getConfigPath(): string {
  if (configPathOverride) return configPathOverride;
  if (!configPath) {
    const { app } = require("electron");
    configPath = path.join(app.getPath("userData"), "config.json");
  }
  return configPath;
}
```

Using `require("electron")` lazily means the module can be imported in a Node.js (non-Electron) context as long as `setConfigPath()` is called first. The `require` is only evaluated when `configPathOverride` is null.

### `package.json` additions

- Add `bin` field: `{ "local-panel": "./dist/cli/index.js" }`
- Add `commander` to `dependencies`.

## Implementation Steps

### Step 1 — Decouple `src/store/config.ts` from `app.getPath`

**Files:** `src/store/config.ts`

Apply the `setConfigPath` / lazy `require("electron")` change described above. Add `LOCAL_PANEL_CONFIG` environment variable support:

```ts
function getConfigPath(): string {
  if (process.env.LOCAL_PANEL_CONFIG) return process.env.LOCAL_PANEL_CONFIG;
  if (configPathOverride) return configPathOverride;
  if (!configPath) {
    const { app } = require("electron") as typeof import("electron");
    configPath = path.join(app.getPath("userData"), "config.json");
  }
  return configPath;
}
```

This means the CLI can point to any config file via `LOCAL_PANEL_CONFIG=/path/to/config.json local-panel start` without any code changes to the proxy or mock logic.

**Deliverable:** `import { loadConfig } from "../store/config"` works in a plain Node.js process when `LOCAL_PANEL_CONFIG` is set or `setConfigPath()` has been called.

---

### Step 2 — `src/store/captureStore.ts` (move capture persistence to main process)

**Files:** `src/store/captureStore.ts` (new)

Implement the module as shown in the Data Model Changes section above.

**Deliverable:** Capture files `captures-{wsId}.json` are written to `dataDir` (which is `userData` in Electron, or the config file's directory in CLI mode).

---

### Step 3 — Wire capture store into `src/proxy/server.ts`

**Files:** `src/proxy/server.ts`

Currently `emitLog(entry)` only emits an EventEmitter event. Add an optional integration point that does not create an Electron dependency:

```ts
let captureCallback: ((workspaceId: string, entry: RequestLogEntry) => void) | null = null;

export function setCaptureCallback(fn: (workspaceId: string, entry: RequestLogEntry) => void): void {
  captureCallback = fn;
}

function emitLog(entry: RequestLogEntry): void {
  logEmitter.emit("request", entry);
  if (captureCallback) {
    captureCallback(currentConfig.activeWorkspaceId, entry);
  }
}
```

**Deliverable:** Both Electron and CLI callers can hook into the capture stream by calling `setCaptureCallback`.

---

### Step 4 — Wire `captureStore` into Electron main process (`src/main.ts`)

**Files:** `src/main.ts`

```ts
import { initCaptureStore, appendCapture } from "./store/captureStore";
import { setCaptureCallback } from "./proxy/server";
import { app } from "electron";

app.whenReady().then(() => {
  const userData = app.getPath("userData");
  initCaptureStore(userData);
  setCaptureCallback((workspaceId, entry) => appendCapture(workspaceId, entry));
  // ... existing startup code
});
```

**Deliverable:** In Electron mode, captures are written to `userData/captures-{wsId}.json` in addition to being sent to the renderer via `log:entry`. The renderer's `localStorage` cache becomes a secondary display buffer, not the source of truth.

---

### Step 5 — New IPC handlers for capture store (`src/ipc/handlers.ts`)

**Files:** `src/ipc/handlers.ts`, `src/preload.ts`

```ts
import { loadCaptures, clearCaptures } from "../store/captureStore";

ipcMain.handle("capture:list", (_e, workspaceId: string) => loadCaptures(workspaceId));
ipcMain.handle("capture:clear", (_e, workspaceId: string) => { clearCaptures(workspaceId); return { ok: true }; });
```

Add to `src/preload.ts`:

```ts
listCaptures: (workspaceId: string) => ipcRenderer.invoke("capture:list", workspaceId),
clearCaptures: (workspaceId: string) => ipcRenderer.invoke("capture:clear", workspaceId),
```

Update `renderer/panels/CapturePanel.tsx` to load initial capture history from `window.api.listCaptures(workspaceId)` on mount, then continue appending `log:entry` events in memory. The localStorage read-on-mount can remain as a migration fallback: if `listCaptures` returns an empty array and localStorage has entries, migrate them to the main process by replaying them through `appendCapture` and then clearing localStorage.

**Deliverable:** `CapturePanel` data is durable across renderer restarts without depending on localStorage as the primary store.

---

### Step 6 — CLI entry point (`src/cli/index.ts`)

**Files:** `src/cli/index.ts` (new)

```ts
#!/usr/bin/env node
import { Command } from "commander";
import * as path from "path";
import { setConfigPath } from "../store/config";

const program = new Command();
program.name("local-panel").version("__APP_VERSION__").description("Local Panel CLI — headless proxy/mock server");

program
  .command("start")
  .description("Start the proxy server")
  .option("--config <path>", "Path to config.json (overrides LOCAL_PANEL_CONFIG env var)")
  .option("--port <n>", "Override proxy port", parseInt)
  .option("--output-log <path>", "Write request log as NDJSON to this file")
  .option("--workspace <id>", "Workspace ID to activate (default: activeWorkspaceId in config)")
  .option("--watch-config", "Reload config on file change")
  .action((opts) => require("./commands/start").start(opts));

program
  .command("capture")
  .description("Capture commands")
  .addCommand(
    new Command("export")
      .description("Export captured requests as a Postman collection")
      .option("--config <path>", "Path to config.json")
      .option("--workspace <id>", "Workspace ID to export captures for")
      .option("--output <path>", "Output file path (default: stdout)")
      .action((opts) => require("./commands/captureExport").captureExport(opts))
  );

program.parse(process.argv);
```

**Deliverable:** Running `local-panel --help` prints usage. The command routing delegates to separate command modules.

---

### Step 7 — `start` command (`src/cli/commands/start.ts`)

**Files:** `src/cli/commands/start.ts` (new)

```ts
import * as fs from "fs";
import * as path from "path";
import { setConfigPath, loadConfig } from "../../store/config";
import { initCaptureStore, appendCapture } from "../../store/captureStore";
import { startServer, stopServer, logEmitter, setCaptureCallback, RequestLogEntry } from "../../proxy/server";

export function start(opts: {
  config?: string;
  port?: number;
  outputLog?: string;
  workspace?: string;
  watchConfig?: boolean;
}): void {
  const configPath = opts.config ?? process.env.LOCAL_PANEL_CONFIG;
  if (!configPath) {
    console.error("Error: --config <path> is required (or set LOCAL_PANEL_CONFIG)");
    process.exit(1);
  }

  setConfigPath(configPath);
  const configDir = path.dirname(path.resolve(configPath));
  initCaptureStore(configDir);

  const cfg = loadConfig();
  if (opts.workspace) cfg.activeWorkspaceId = opts.workspace;
  const port = opts.port ?? cfg.port;

  let logStream: fs.WriteStream | null = null;
  if (opts.outputLog) logStream = fs.createWriteStream(opts.outputLog, { flags: "a" });

  setCaptureCallback((wsId, entry) => appendCapture(wsId, entry));

  logEmitter.on("request", (entry: RequestLogEntry) => {
    const line = JSON.stringify(entry);
    if (logStream) logStream.write(line + "\n");
    else process.stdout.write(line + "\n");
  });

  startServer(port);
  console.error(`[local-panel] proxy listening on 127.0.0.1:${port} — workspace: ${cfg.activeWorkspaceId}`);

  if (opts.watchConfig && configPath) {
    fs.watch(configPath, () => {
      console.error("[local-panel] config changed, reloading...");
      const { reloadConfig } = require("../../proxy/server");
      reloadConfig();
    });
  }

  process.on("SIGINT",  () => { stopServer(); logStream?.end(); process.exit(0); });
  process.on("SIGTERM", () => { stopServer(); logStream?.end(); process.exit(0); });
}
```

**Deliverable:** `local-panel start --config ./config.json --port 9010` starts the proxy and streams NDJSON request logs.

---

### Step 8 — `capture export` command (`src/cli/commands/captureExport.ts`)

**Files:** `src/cli/commands/captureExport.ts` (new)

```ts
import * as fs from "fs";
import { setConfigPath, loadConfig } from "../../store/config";
import { initCaptureStore, loadCaptures } from "../../store/captureStore";
import { exportCapturesToPostman } from "../../lib/postmanExport";  // see note below
import * as path from "path";

export function captureExport(opts: { config?: string; workspace?: string; output?: string }): void {
  const configPath = opts.config ?? process.env.LOCAL_PANEL_CONFIG;
  if (!configPath) { console.error("Error: --config required"); process.exit(1); }

  setConfigPath(configPath);
  initCaptureStore(path.dirname(path.resolve(configPath)));

  const cfg = loadConfig();
  const wsId = opts.workspace ?? cfg.activeWorkspaceId;
  const entries = loadCaptures(wsId);
  const collection = exportCapturesToPostman(entries, `Captures — ${wsId}`);
  const json = JSON.stringify(collection, null, 2);

  if (opts.output) fs.writeFileSync(opts.output, json, "utf-8");
  else process.stdout.write(json + "\n");
}
```

Note: `exportCapturesToPostman` is a pure utility function that converts `RequestLogEntry[]` to a Postman collection v2.1 format. This utility should live in `src/lib/postmanExport.ts` (new file, no Electron imports) so it can be shared between the CLI and a future Electron export button in `CapturePanel`.

**Deliverable:** `local-panel capture export --config ./config.json --output captures.json` writes a Postman collection.

---

### Step 9 — CLI build target

**Files:** `package.json`, `webpack.cli.config.js` (new) or `esbuild.cli.mjs` (new)

Add an esbuild script alongside the existing Electron build:

```js
// esbuild.cli.mjs
import { build } from "esbuild";
build({
  entryPoints: ["src/cli/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: "dist/cli/index.js",
  external: ["electron"],   // not bundled — will not be present at runtime
  banner: { js: "#!/usr/bin/env node" },
  define: { "__APP_VERSION__": `"${process.env.npm_package_version}"` },
});
```

Add to `package.json`:

```json
"scripts": {
  "build:cli": "node esbuild.cli.mjs"
},
"bin": {
  "local-panel": "./dist/cli/index.js"
}
```

Run `chmod +x dist/cli/index.js` as a postbuild step on Unix.

**Deliverable:** `npm run build:cli` produces a standalone `dist/cli/index.js` with no Electron dependency.

---

### Step 10 — GitHub Actions example workflow

**Files:** `.github/workflows/integration-test.yml` (new example, not wired to CI)

```yaml
name: Integration tests with Local Panel mock server

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npm run build:cli

      - name: Start mock proxy
        run: |
          ./dist/cli/index.js start \
            --config ./test/fixtures/local-panel.json \
            --port 9010 \
            --output-log /tmp/captures.ndjson &
          echo "PROXY_PID=$!" >> $GITHUB_ENV
          # Wait for proxy to bind
          until nc -z 127.0.0.1 9010; do sleep 0.2; done

      - name: Run integration tests
        env:
          HTTP_PROXY: http://127.0.0.1:9010
        run: npm test

      - name: Export captures
        run: |
          ./dist/cli/index.js capture export \
            --config ./test/fixtures/local-panel.json \
            --output /tmp/captures.json

      - name: Upload captures artifact
        uses: actions/upload-artifact@v4
        with:
          name: captures
          path: /tmp/captures.json

      - name: Stop proxy
        if: always()
        run: kill $PROXY_PID || true
```

**Deliverable:** CI teams have a copy-pasteable workflow that starts the mock proxy, runs tests, and archives captures.

## IPC / API Surface

New IPC channels added to `src/ipc/handlers.ts` (Electron only — not CLI):

| Channel | Direction | Payload | Return |
|---|---|---|---|
| `capture:list` | renderer → main | `workspaceId: string` | `RequestLogEntry[]` |
| `capture:clear` | renderer → main | `workspaceId: string` | `{ ok: true }` |

New `window.api` methods in `src/preload.ts`: `listCaptures`, `clearCaptures`.

The CLI does not use IPC at all — it calls the same `src/proxy/server.ts` and `src/store/captureStore.ts` functions directly.

## UI Components

| Component | Status | Notes |
|---|---|---|
| `renderer/panels/CapturePanel.tsx` | Modified | Load initial history from `window.api.listCaptures` on mount; localStorage used as migration source only |

## Testing Notes

- **Step 1:** Write a test that imports `loadConfig` without Electron installed (mock `require("electron")` to throw). Set `LOCAL_PANEL_CONFIG` to a temp file path. Assert `loadConfig()` reads from that file.
- **Step 2:** Call `appendCapture("ws1", fixture)` 250 times. Assert `loadCaptures("ws1")` returns 200 entries (MAX_ENTRIES). Assert the 200 entries are the most recent 200.
- **Step 3:** Call `setCaptureCallback(spy)`. Trigger a request through the test server. Assert `spy` was called with the correct `workspaceId` and a `RequestLogEntry`.
- **Step 7:** Start the CLI `start` command programmatically in a test process. Send an HTTP request to `127.0.0.1:PORT`. Assert NDJSON appears on stdout (or the output log file). Send SIGINT and assert the process exits cleanly.
- **Step 8:** Write 5 fixture `RequestLogEntry` objects to a `captures-{wsId}.json` file. Run `captureExport` pointing at that config dir. Assert the output is valid Postman collection v2.1 JSON with 5 items.
- **Step 10:** Run the full GitHub Actions workflow on a test branch (manual trigger). Verify artifact `captures.json` is uploaded.

## Out of Scope

- A `local-panel stop` command that stops a running daemon (use `kill` / `pkill` in CI scripts; daemon mode is not in scope).
- Windows named-pipe based IPC between the CLI and the Electron app (no shared-process architecture).
- Mock editing via CLI (the CLI is read-only for config; mutations require Electron or direct JSON editing).
- HTTPS interception in headless mode (CONNECT tunnel passthrough is unchanged; CLI inherits the same limitation as the Electron proxy).
- npm publish / binary distribution — the CLI is consumed by building from source.
- `--daemon` / background mode managed by the CLI itself (use shell `&` or a process manager like `pm2`).
