# Features Overview

Local Panel is a desktop Electron application for local API routing, mocking, traffic capture, request replay, and git-backed workspace management. It runs a raw TCP proxy server on localhost and provides a full-featured UI for managing API development workflows across REST, GraphQL, SOAP, and gRPC protocols.

---

## Protocol Support

| Feature | REST | GraphQL | SOAP | gRPC |
|---------|:----:|:-------:|:----:|:----:|
| Request execution | ✓ | ✓ | ✓ | ✓ |
| Mock responses | ✓ | ✓ | ✓ | ✓ |
| Schema / definition support | — | Introspection + SDL | WSDL import | Proto + Reflection |
| Streaming | SSE + Chunked | — | — | Unary / Server / Client / Bidi |
| Pre/Post scripts | ✓ | ✓ | ✓ | ✓ |
| Environment variable substitution | ✓ | ✓ | ✓ | ✓ |
| Randomizer tokens | ✓ | ✓ | ✓ | ✓ |
| Folder organization | ✓ | ✓ | ✓ | ✓ |
| Git-tracked history | ✓ | ✓ | ✓ | ✓ |
| Proxy-level mock interception | ✓ | ✓ | ✓ | — |

---

## Core Features

### 1. Service Discovery

**What it does:** Scans all listening localhost ports and displays process name, PID, address, and whether that port is already mapped. One-click shortcut to create a mapping from any discovered service.

**Location:** `renderer/panels/ServicesPanel.tsx`, `src/proxy/service-discovery.ts`

**Capabilities:**
- Auto-detect all local listening TCP ports
- Show process name and PID for each port
- Indicate if a port already has a mapping
- Quick-create mapping from discovered service

**Platform support:** Windows (PowerShell), macOS/Linux (lsof/ss)

---

### 2. Localhost Domain Mappings

**What it does:** Maps friendly `.localhost` domains (e.g., `myapp.localhost`) to local services running on specific ports, using RFC 6761 special-use domain resolution.

**Location:** `renderer/panels/MappingsPanel.tsx`, `src/ipc/handlers.ts`, `src/proxy/server.ts`

**Capabilities:**
- Map any `*.localhost` subdomain to a `host:port` target
- Enable/disable mappings individually
- Per-workspace scoping
- Git-tracked history with publish/restore
- No `/etc/hosts` edits required (RFC 6761 standard)
- Works in all modern browsers natively

**How it works:** Browsers resolve `*.localhost` to `127.0.0.1` automatically per RFC 6761. When traffic arrives at Local Panel with a `.localhost` host header, it's routed directly to the configured upstream service.

> **Port note:** RFC 6761 routing only works when traffic reaches Local Panel on port 80 or when using the proxy mode. If Local Panel runs on a non-standard port (e.g. 9010), you must either configure the browser proxy to `127.0.0.1:9010` or access the domain with the explicit port: `http://myapp.localhost:9010`.

---

### 3. Proxy Rules

**What it does:** Intercepts and redirects matching HTTP requests to configured targets, with support for request/response scripting to mutate traffic in-flight.

**Location:** `renderer/panels/ProxyRulesPanel.tsx`, `src/proxy/proxyHandler.ts`, `src/proxy/scriptExecutor.ts`

**Capabilities:**
- Match by exact URL string or regex pattern
- Redirect to any mapping target or external URL
- Request scripts (modify headers, body, URL before forwarding)
- Response scripts (modify headers, body, status before returning)
- Folder organization
- Enable/disable per rule
- Sandboxed script execution with timeout

**Rule exclusivity:** Only one rule can be enabled per URL pattern (static or regex). Enabling a second rule for the same pattern automatically disables the previously enabled one. There is no ordering or priority — each pattern has exactly one active rule at a time.

**Limitations:**
- Only fires in forward proxy path (not RFC 6761 path)
- Scripts are synchronous with fixed timeout

---

### 4. Mock Server

**What it does:** Short-circuits real API requests and returns configured responses. Supports variable substitution, binary payloads, response delays, SSE streaming, and chunked streaming.

**Location:** `renderer/panels/MocksPanel.tsx`, `renderer/components/RestTab.tsx`, `src/proxy/mockHandler.ts`

**Capabilities:**
- Match by HTTP method + URL (exact or regex)
- Configurable response status, headers, and body
- Environment variable substitution (`{{VAR}}` syntax)
- Built-in randomizer tokens (`{{random.uuid}}`, `{{random.email}}`, etc.)
- Binary/base64 response bodies
- Response delay simulation
- Server-Sent Events (SSE) streaming
- Chunked transfer encoding
- Folder organization
- Duplicate, import/export
- Auto-disable on signature conflicts

**Limitations:**
- First-match-wins (no multi-response sequences)
- Only fires in forward proxy path (not RFC 6761)
- No conditional logic within a single mock

---

### 5. HTTP Traffic Capture

**What it does:** Captures all proxied, mocked, ruled, and mapped requests in a live traffic log with full request/response inspection.

**Location:** `renderer/panels/CapturePanel.tsx`, `src/proxy/logEmitter.ts`

**Capabilities:**
- Live capture of all traffic through Local Panel
- Filter by method, URL, status, via-type
- Full request/response header and body inspection
- Streaming body accumulation (see partial responses)
- Create mock from captured request/response
- Open capture as editable request
- Clear log, delete individual entries
- Up to 200 entries per workspace

**Limitations:**
- Stored in renderer local storage (not git-tracked)
- CONNECT tunnels without TLS interception are not inspectable
- No export to file (use Import/Export for that)

---

### 6. Saved Requests & Replay

**What it does:** Full-featured HTTP request editor with folders, drafts, environment resolution, pre/post scripts, cURL import, and direct send capability.

**Location:** `renderer/panels/RequestsPanel.tsx`, `renderer/components/RestTab.tsx`

**Capabilities:**
- Tabbed request editor with draft support
- All HTTP methods supported
- Headers editor with auto-complete
- Body modes: none, raw (JSON/XML/text), form-data, binary
- cURL import (paste and convert)
- Environment variable resolution in URL, headers, body
- Pre-request and post-response scripts
- Send request directly (bypasses proxy)
- Create mock from response
- Folder organization
- Git-tracked with publish/restore

**Limitations:**
- Replay uses Node.js http/https directly (no browser context)
- Cookies, CORS, and browser-specific behaviors not modeled
- No request chaining or collection runner

---

### 7. WebSocket Client

**What it does:** Interactive WebSocket connection workspace with saved definitions, send/receive message inspection, and environment-aware URLs.

**Location:** `renderer/panels/WebSocketsPanel.tsx`, `renderer/lib/useWebSocket.ts`

**Capabilities:**
- Save WebSocket connection definitions
- Connect/disconnect with live status
- Send text/JSON messages
- View incoming and outgoing message history
- Environment variable resolution in URLs and headers
- Tabbed interface with folder organization
- Max 5 concurrent connections

**Limitations:**
- Message history is runtime-only (not persisted)
- No binary message support in UI
- Browser-native WebSocket (doesn't go through proxy)

---

### 8. Webhook Receiver

**What it does:** Runs a dedicated HTTP server to receive incoming webhook POST requests, with per-endpoint activation and live payload inspection.

**Location:** `renderer/panels/WebhooksPanel.tsx`, `src/proxy/webhookServer.ts`

**Capabilities:**
- Separate webhook server on configurable port
- Named webhook endpoints (`/localpanel/webhooks/{slug}`)
- Activate/deactivate per endpoint
- Live payload inspection (headers + body)
- Start/stop webhook server from UI
- Up to 5 active webhook listeners

**Limitations:**
- POST only (no GET, PUT, DELETE webhooks)
- Payload history is in-memory (not persisted)
- No webhook forwarding/replay

---

### 9. Environments & Variables

**What it does:** Named variable sets with double-brace substitution across all features (requests, mocks, WebSockets, health checks).

**Location:** `renderer/panels/EnvironmentsPanel.tsx`, `src/lib/randomizer.ts`

**Capabilities:**
- Multiple named environments per workspace
- One active environment at a time
- `{{VARIABLE}}` substitution everywhere
- Built-in randomizer tokens:
  - `{{random.uuid}}` — UUID v4
  - `{{random.email}}` — random email
  - `{{random.name}}` — random full name
  - `{{random.int}}` — random integer
  - `{{random.float}}` — random float
  - `{{random.date}}` — random ISO date
  - `{{random.boolean}}` — true/false
  - `{{random.hex}}` — random hex string
- Git-tracked with history

**Limitations:**
- Only one active environment per workspace
- No environment inheritance or composition
- No secret masking in UI

---

### 10. TLS Interception & CA Management

**What it does:** Generates a local Certificate Authority, manages trust, and enables HTTPS traffic inspection for mocks and rules to work on encrypted traffic.

**Location:** `renderer/panels/SettingsPanel.tsx`, `src/proxy/certManager.ts`, `src/proxy/tlsCert.ts`, `src/proxy/tlsIntercept.ts`

**Capabilities:**
- Generate local CA certificate
- Import/export CA material
- Install CA into OS trust store (Windows, macOS)
- Per-host leaf certificate generation on demand
- Enable/disable TLS interception globally
- When enabled: mocks and rules work on HTTPS traffic

**Limitations:**
- Without CA trust, HTTPS remains opaque tunnel
- Linux trust store install requires manual steps
- Per-host cert generation adds slight latency on first request

---

### 11. Health Bar Monitoring

**What it does:** Endpoint health checker — configure URLs, run checks individually or in bulk, auto-refresh on load, inspect response details.

**Location:** `renderer/panels/HealthBarPanel.tsx`, `src/ipc/handlers.ts`

**Capabilities:**
- Add named health check URLs
- Environment variable resolution in URLs
- Run individual or bulk health checks
- Auto-refresh flagged services on panel open
- Inspect response headers and body
- Status indicators (up/down/slow)
- Git-tracked via `healthbar/services.json`

**Limitations:**
- Not a first-class entity type (no folders, no import/export)
- No scheduled/automated checks
- No alerting or notifications

---

### 12. Git-Backed Version Control

**What it does:** Every workspace is a git repository. All entities are tracked, with publish/restore, per-file history, diff viewing, and audit log.

**Location:** `src/sync/publishService.ts`, `src/sync/statusTracker.ts`, `renderer/components/HistorySidebar.tsx`, `renderer/panels/AuditLogPanel.tsx`

**Capabilities:**
- Every workspace is an independent git repo
- Per-entity file tracking (clean/modified/new/deleted)
- Publish individual or bulk changes
- Restore entities to last committed state
- Per-file history with diff view
- Workspace-wide audit log (who changed what, when)
- Status badges on all entities

**Limitations:**
- Restore only reverts to HEAD (not arbitrary historical revision)
- No branching or merge UI
- Audit log is local (not shared until synced)

---

### 13. Remote Git Sync

**What it does:** Push/pull workspace data to a remote git repository for team sharing and backup.

**Location:** `renderer/panels/WorkspacePanel.tsx`, `src/sync/syncManager.ts`, `src/sync/autoSync.ts`

**Capabilities:**
- Connect workspace to remote git branch
- Push/pull workspace state
- Clone remote into empty workspace
- Auto-sync polling (check remote HEAD periodically)
- Sync status indicators

**Limitations:**
- Basic merge handling (stash/merge fallback)
- No conflict resolution UI
- No authentication UI (relies on git credential helpers)

---

### 14. Import/Export

**What it does:** Import and export entities in multiple formats with collision detection.

**Location:** `renderer/components/ImportExportModal.tsx`, `src/ipc/importExport/`

**Supported formats:**
- Local Panel JSON (all entity types)
- ZIP (workspace archive)
- Postman Collection v2.1
- OpenAPI 3.x
- cURL commands
- HAR (HTTP Archive)
- Insomnia v4
- WireMock JSON
- dotenv files (for environments)

**Capabilities:**
- Preflight collision detection
- Bulk import with merge options
- Per-entity-type export
- Format auto-detection on import

---

### 15. Browser Extension

**What it does:** Chrome extension with proxy toggle, port configuration, and DevTools panel for capturing network requests directly into Local Panel.

**Location:** `extension/`

**Capabilities:**
- One-click proxy enable/disable via popup
- Configure proxy and companion ports
- DevTools panel with full request/response capture
- Send captured requests as mocks or saved requests
- Context menu integration for URLs
- PAC script for selective proxying

**Limitations:**
- Chrome/Chromium only (MV3)
- PAC script affects all browser traffic when enabled
- Context menu only captures URL (not full request)

---

### 16. Workspace Management

**What it does:** Multiple isolated workspaces, each with its own entities, git repo, and configuration.

**Location:** `renderer/App.tsx`, `renderer/components/WorkspaceSelector.tsx`

**Capabilities:**
- Create/delete/switch workspaces
- Each workspace is fully isolated
- Independent git repo per workspace
- Workspace-scoped entities (all types)
- Quick workspace switcher in sidebar

---

### 17. Application Shell

**What it does:** Desktop Electron app with system tray, custom titlebar, theming, and persistent background operation.

**Location:** `src/main.ts`, `renderer/components/TitleBar.tsx`

**Capabilities:**
- System tray with minimize-to-tray
- Custom frameless titlebar
- Dark theme (navy/periwinkle palette)
- Always-on background proxy server
- Auto-start proxy and companion on launch
- Configurable ports (proxy, webhook, companion)

---

## Feature Interaction Matrix

| Feature | Uses Mappings | Uses Mocks | Uses Rules | Uses Env Vars | Git Tracked |
|---------|:---:|:---:|:---:|:---:|:---:|
| RFC 6761 routing | ✓ | ✗ | ✗ | ✗ | — |
| Forward proxy | ✗ | ✓ | ✓ | ✗ | — |
| REST Mock responses | ✗ | — | ✗ | ✓ | ✓ |
| GraphQL Mock responses | ✗ | — | ✗ | ✓ | ✓ |
| SOAP Mock responses | ✗ | — | ✗ | ✓ | ✓ |
| gRPC Mock server | ✗ | — | ✗ | ✗ | ✓ |
| Proxy rules | ✓ | ✗ | — | ✗ | ✓ |
| REST requests | ✗ | ✗ | ✗ | ✓ | ✓ |
| GraphQL requests | ✗ | ✗ | ✗ | ✓ | ✓ |
| SOAP requests | ✗ | ✗ | ✗ | ✓ | ✓ |
| gRPC requests | ✗ | ✗ | ✗ | ✓ | ✓ |
| WebSocket | ✗ | ✗ | ✗ | ✓ | ✓ |
| Health checks | ✗ | ✗ | ✗ | ✓ | ✓ |
| Webhooks | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## New Protocol Features

### 18. GraphQL Client & Mocks

**What it does:** Full GraphQL request executor with schema introspection, operation explorer, variable support, and proxy-level mock interception.

**Location:** `renderer/panels/GraphQLRequestsPanel.tsx`, `renderer/panels/GraphQLMocksPanel.tsx`, `renderer/components/GraphQLTab.tsx`, `renderer/components/graphql/SchemaExplorer.tsx`

**Capabilities:**
- Send queries, mutations, and subscriptions
- Schema introspection from live servers
- SDL schema import and storage
- Operation explorer with click-to-generate queries
- Auto-populated variables from schema type info
- Mock operations by type and name
- Proxy-level interception (no browser proxy change required)
- Pre/post scripts
- Environment variable substitution
- Folder organization and git tracking

**Limitations:**
- No subscription streaming (returns first message only)
- Introspection requires server to have it enabled

---

### 19. SOAP Client & Mocks

**What it does:** SOAP/XML request sender with WSDL-driven operation discovery, envelope generation, and proxy-level mock interception by SOAPAction header.

**Location:** `renderer/panels/SoapRequestsPanel.tsx`, `renderer/panels/SoapMocksPanel.tsx`, `renderer/components/SoapTab.tsx`, `renderer/components/soap/WsdlExplorer.tsx`

**Capabilities:**
- Send SOAP 1.1 and 1.2 requests
- WSDL import from URL or pasted content
- Operation discovery with namespace and SOAPAction extraction
- Auto-generate SOAP envelope with typed placeholders
- Mock by SOAPAction header + optional operation name
- Proxy-level interception of SOAP traffic
- Pre/post scripts
- Environment variable substitution
- Folder organization and git tracking

**Limitations:**
- Basic WSDL parsing (no complex schema-in-WSDL type resolution)
- No multi-part MIME SOAP attachments

---

### 20. gRPC Client & Mocks

**What it does:** gRPC request executor with proto file management, server reflection, streaming type support, and a local mock server.

**Location:** `renderer/panels/GrpcRequestsPanel.tsx`, `renderer/panels/GrpcMocksPanel.tsx`, `renderer/components/GrpcTab.tsx`, `renderer/components/grpc/ProtoExplorer.tsx`

**Capabilities:**
- Connect to gRPC servers (TLS and plaintext)
- Import `.proto` files for service definitions
- Server reflection for automatic service discovery
- All four streaming types: Unary, Server, Client, Bidirectional
- Run a local gRPC mock server on port 9102
- Mock individual methods with JSON responses
- Configurable gRPC status codes for error simulation
- Pre/post scripts
- Environment variable substitution
- Folder organization and git tracking

**Limitations:**
- gRPC execution requires `@grpc/grpc-js` (not bundled by default)
- Mock server is not proxy-based (clients must point directly to port 9102)
- No TLS certificate management for gRPC connections
