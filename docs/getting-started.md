# Getting Started

## Installation

### Download
Download the latest release from the [releases page](https://github.com/HarshalKudale/local-panel/releases).

- **Windows:** Download the `.exe` installer (NSIS)
- **macOS:** Coming soon
- **Linux:** Coming soon

### Build from Source
```bash
git clone https://github.com/HarshalKudale/local-panel.git
cd local-panel
npm install
npm run dev
```

---

## First Launch

1. **Start Local Panel** — The app launches with the proxy server already running on port `9010` (configurable in Settings).

2. **Check Services** — Navigate to the **Services** panel to see all localhost ports currently in use on your machine.

3. **Create a Mapping** — Click the quick-map button next to any discovered service, or go to **Mappings** and create one manually (e.g., `myapp.localhost` → `127.0.0.1:3000`).

4. **Configure Your Browser** — Either:
   - Use the **Browser Extension** (recommended) to toggle proxy on/off
   - Set your browser/OS proxy to `127.0.0.1:9010`

5. **Navigate to your domain** — Open `http://myapp.localhost` in your browser (when using proxy mode via browser proxy or extension). Traffic flows through Local Panel to your local service.

> **Port note:** `.localhost` domains resolve to `127.0.0.1` automatically per RFC 6761. If Local Panel is not running on port 80, you need to route traffic through it via the system proxy (`127.0.0.1:9010`) or the browser extension, *or* access the URL with an explicit port: `http://myapp.localhost:9010`.

---

## Sidebar Navigation

The sidebar is divided into two main sections:

### Mock
Create mock servers for any protocol:
- **REST Mocks** — intercept HTTP requests and return configured responses
- **GraphQL Mocks** — match GraphQL operations by type and name
- **SOAP Mocks** — match by SOAPAction header and operation name
- **gRPC Mocks** — run a local gRPC mock server from proto definitions

### Request
Send real requests to APIs:
- **REST** — full HTTP client with headers, body, scripts
- **GraphQL** — query/mutation/subscription executor with schema explorer
- **SOAP** — WSDL-driven request builder and sender
- **gRPC** — proto-based client with server reflection support

---

## Choosing the Right Protocol

| Your API uses... | Use |
|---|---|
| Standard HTTP/JSON REST | **REST** panels |
| GraphQL over HTTP | **GraphQL** panels |
| SOAP/XML web services | **SOAP** panels |
| gRPC / Protocol Buffers | **gRPC** panels |
| Unknown — test it | Start with **REST**, check headers for `Content-Type: application/soap+xml` (SOAP) or look for a `.proto` file (gRPC) |

---

## Quick Setup Guides

### Mock an API endpoint
1. Go to **Mock → REST** in the sidebar
2. Click **+ New Mock**
3. Set method (e.g., `GET`), URL pattern (e.g., `/api/users`)
4. Configure response body, status, headers
5. Enable the mock
6. Any matching request through the proxy returns your mock response

### Send a GraphQL query
1. Go to **Request → GraphQL**
2. Click **+ New Request**
3. Enter your GraphQL endpoint URL
4. Use the **Schema** tab to introspect the server and browse available operations
5. Click an operation to auto-generate the query and variables
6. Click **Send**

### Test a SOAP service
1. Go to **Request → SOAP**
2. Click **+ New Request**
3. Enter your endpoint URL, then open the **WSDL** tab
4. Paste or fetch your WSDL URL to discover operations
5. Click an operation to auto-generate the SOAP envelope
6. Click **Send**

### Connect to a gRPC service
1. Go to **Request → gRPC**
2. Click **+ New Request**
3. Enter the server address (e.g., `localhost:50051`)
4. Import a `.proto` file or use **Server Reflection** to discover services
5. Select a service and method, fill in the message body
6. Click **Invoke**

### Capture and inspect traffic
1. Ensure your browser proxy points to Local Panel
2. Go to **Capture** panel
3. Browse normally — all requests appear in the capture log
4. Click any entry to inspect full request/response details
5. Right-click to create a mock or saved request from captures

### Set up environment variables
1. Go to **Environments** panel
2. Create a new environment (e.g., "Development")
3. Add variables (e.g., `API_KEY=abc123`, `BASE_URL=http://localhost:3000`)
4. Activate the environment
5. Use `{{API_KEY}}` in mocks, requests, health checks — resolved at runtime

### Enable HTTPS inspection
1. Go to **Settings**
2. Click **Generate CA** to create a local certificate authority
3. Click **Install CA** to trust it in your OS
4. Enable **TLS Interception**
5. Now mocks and rules work on HTTPS traffic too

---

## System Requirements

- **OS:** Windows 10+ (macOS and Linux support planned)
- **RAM:** 100MB minimum
- **Disk:** 50MB for app + workspace data
- **Network:** Localhost access only (no external connections required)
- **Git:** Required for version control features (auto-detected on startup)

---

## Ports Used

| Port | Purpose | Configurable |
|------|---------|:---:|
| 9010 | Main proxy server | ✓ |
| 9101 | Webhook receiver | ✓ |
| 9271 | Companion WebSocket (extension bridge) | ✓ |
| 9102 | gRPC mock server | ✓ |

All ports bind to `127.0.0.1` only — no external network exposure.
