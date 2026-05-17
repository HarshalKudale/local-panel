# Local Panel — Network Architecture

This document explains how every part of Local Panel's network layer works: mappings, mocks, proxy rules, RFC 6761 routing, WebSocket connections, and the Requests panel replay. It also answers the common question: **"Will using a system proxy cause a loop?"**

---

## 1. The Server

Local Panel runs a single raw TCP server bound to `127.0.0.1:<PORT>` (default 9010). It is **not** an `http.Server` — it is `net.createServer()`. This means it reads raw bytes off the socket and manually parses the HTTP request line and headers.

```
Browser / App
    │
    ▼
127.0.0.1:9010  ← Local Panel TCP server
```

Only two types of requests reach this server:

| How it arrives | Example |
|---|---|
| **RFC 6761** — browser resolves `*.localhost` natively | `http://myapp.localhost/api/users` |
| **Forward proxy** — OS/browser sends absolute URL | `GET http://api.example.com/v1 HTTP/1.1` |

---

## 2. Request Routing — The Full Flowchart

```
Incoming TCP connection on 127.0.0.1:PORT
         │
         ▼
  Parse HTTP method + target
         │
         ├─── method == CONNECT ──────────────► tcpTunnel()
         │                                      (raw pipe, no inspection, no log)
         │
         ▼
  Extract Host header → host
         │
         ├─── host == "localhost" ────────────► Serve HTML home page (no log)
         │
         ├─── host ends with ".localhost" ────► RFC 6761 path (see §3)
         │
         ├─── target starts with "http://" ──► Forward proxy path (see §4)
         │    or "https://"
         │
         └─── anything else ──────────────────► 400 Bad Request
```

---

## 3. RFC 6761 Path (*.localhost domains)

RFC 6761 is an IETF standard that designates `*.localhost` as a special-use domain. All major browsers resolve any `*.localhost` subdomain to `127.0.0.1` **without touching DNS**. No `/etc/hosts` edits are needed.

### How it works

1. You create a mapping: `myapp.localhost` → `127.0.0.1:3000`
2. Browser navigates to `http://myapp.localhost`
3. Browser connects to `127.0.0.1:80` ... but Local Panel isn't on port 80.

Wait — this only works if the browser is configured to send traffic to Local Panel on port 9010. There are two ways this happens:

**Option A — System proxy set to `127.0.0.1:9010`**
The browser sends: `GET http://myapp.localhost/ HTTP/1.1` (absolute URL). Local Panel receives it in the forward proxy path, but the `host` header is `myapp.localhost` which ends with `.localhost`, so it routes to the RFC 6761 path.

**Option B — OS configured to listen on port 80**
Less common, requires elevated privileges.

### RFC 6761 Routing Flow

```
Request: GET / HTTP/1.1
Host: myapp.localhost
         │
         ▼
  host.endsWith(".localhost") == true
         │
         ▼
  Look up enabled mapping where domain == "myapp.localhost"
         │
         ├─── Found ──────────────► proxyToUpstream("127.0.0.1:3000")
         │                          → direct http.request to 127.0.0.1:3000
         │                          → log entry: via="rfc6761"
         │
         └─── Not found ──────────► 404 "Not Mapped" page
                                    → log entry: via="error"
```

**Critical**: Mocks and proxy rules are **NOT checked** in the RFC 6761 path. Only mappings are checked here.

### proxyToUpstream internals

`proxyToUpstream(socket, method, target, path, headers, body, callback)` makes a direct Node.js `http.request` to `hostname:port`. It never calls back into Local Panel's own TCP server. There is no loop.

---

## 4. Forward Proxy Path

When a browser or application is configured to use Local Panel as an HTTP proxy (`127.0.0.1:9010`), HTTP requests arrive as absolute URLs:

```
GET http://api.example.com/v1/users HTTP/1.1
Host: api.example.com
```

This is the "forward proxy path". The three sub-routes are checked in strict priority order:

```
rawTarget starts with "http://" or "https://"
         │
         ▼
  ┌─────────────────────────────────────┐
  │  3a. REST Mock check                │
  └─────────────────────────────────────┘
         │
         ├─── Mock matched ──────────────► serveMock() → write HTTP response to socket
         │                                → log entry: via="mock"
         │
         ▼ (no REST mock matched)
  ┌─────────────────────────────────────┐
  │  3a-ii. GraphQL Mock check          │
  │  (POST with JSON body + query field)│
  └─────────────────────────────────────┘
         │
         ├─── GraphQL mock matched ──────► serveProtocolMock()
         │                                → log entry: via="mock", target="graphql-mock:id"
         │
         ▼ (no GraphQL mock matched)
  ┌─────────────────────────────────────┐
  │  3a-iii. SOAP Mock check            │
  │  (SOAPAction header present)        │
  └─────────────────────────────────────┘
         │
         ├─── SOAP mock matched ─────────► serveProtocolMock()
         │                                → log entry: via="mock", target="soap-mock:id"
         │
         ▼ (no SOAP mock matched)
  ┌─────────────────────────────────────┐
  │  3b. Proxy rule check               │
  └─────────────────────────────────────┘
         │
         ├─── Rule matched ──────────────► proxyToUpstream(rule's target mapping)
         │                                → log entry: via="rule"
         │
         ▼ (no rule matched)
  ┌─────────────────────────────────────┐
  │  3c. Passthrough (default)          │
  └─────────────────────────────────────┘
         │
         └────────────────────────────────► passthroughToUpstream()
                                           → http.request to original host
                                           → log entry: via="proxy"
```

---

## 5. Mappings

A mapping links a `*.localhost` domain to a backend target:

```
domain:  "myapp.localhost"
target:  "127.0.0.1:3000"
label:   "Frontend Dev Server"
enabled: true
```

Mappings are **only** used in two situations:
1. RFC 6761 path: the incoming `host` header matches `mapping.domain`
2. Proxy rules: a rule references a mapping by ID as its redirect target

**Mappings are per-workspace.** `workspaceCfg()` filters `cfg.mappings` to only those with `workspaceId === activeWorkspaceId` before any routing.

---

## 6. Proxy Rules

A proxy rule redirects matching URLs to a specific mapping target:

```
pattern:         "^https?://api\\.staging\\.example\\.com"  (regex)
targetMappingId: "abc123"   (ID of a mapping)
enabled:         true
```

### Matching flow

```
For each enabled proxy rule (in order):
  Test regex against full absolute URL string
         │
         ├─── Matches ──────────────────► resolve mapping by targetMappingId
         │                               ├─── mapping found ──► proxyToUpstream(target)
         │                               └─── mapping deleted ─► 502 Bad Gateway
         │
         └─── No match ─────────────────► try next rule
                                         (if no rules match → passthrough)
```

Proxy rules only fire in the **forward proxy path**. They have no effect on RFC 6761 requests.

---

## 7. Mocks

A mock short-circuits a real request and returns a configured response:

```
method:          "GET"              (or "*" for any method)
urlPattern:      "/api/users"       (exact) or ".*\/users.*" (regex)
useRegex:        false
responseStatus:  200
responseHeaders: { "content-type": "application/json" }
responseBody:    "[{\"id\":1}]"
enabled:         true
```

### Matching algorithm

```
For each enabled REST mock (in list order):
  1. Method check: mock.method == "*" OR mock.method == request.method
  2. URL check:
     ├─── useRegex == false: mock.urlPattern == full URL string (exact)
     └─── useRegex == true:  new RegExp(mock.urlPattern).test(full URL string)
         │
         └─── Both checks pass ──────────► serveMock()
              Return configured response
              (resolveVars() substitutes {{ENV_VAR}} placeholders)
```

**GraphQL mock matching** — checked after REST mocks, for POST requests with JSON bodies:

```
Is Content-Type application/json?
  Parse body: { query, operationName, variables }
  For each enabled GraphQL mock:
    1. Endpoint URL pattern match (exact or regex)
    2. Operation type: detect from query string (query/mutation/subscription)
    3. Operation name: from operationName field or parsed query
         │
         └─── All pass ──────────► serveProtocolMock()
```

**SOAP mock matching** — checked after GraphQL mocks, for requests with SOAPAction:

```
For each enabled SOAP mock:
  1. Endpoint URL pattern match (exact or regex)
  2. SOAPAction header match (exact substring or regex)
  3. Operation name: extracted from first child of <Body> element (optional)
         │
         └─── All pass ──────────► serveProtocolMock()
```

### Environment variable substitution

Mock body, headers, and URL patterns can use `{{VARIABLE_NAME}}` syntax. These are resolved against the active environment's variables at response time. For example:

```json
{ "token": "{{API_KEY}}" }
```

becomes `{ "token": "secret123" }` if the active environment has `API_KEY=secret123`.

**Mocks only fire in the forward proxy path.** They are never checked for RFC 6761 requests.

---

## 8. HTTPS CONNECT Tunnels

When a browser connects through a proxy to an HTTPS site, it first sends:

```
CONNECT api.example.com:443 HTTP/1.1
```

Local Panel responds `200 Connection Established` and then creates a raw TCP pipe:

```
Browser ←──────── raw pipe ────────► api.example.com:443
```

There is **no TLS termination**, **no inspection**, **no mock matching**, and **no logging** for CONNECT tunnels. The encrypted traffic passes through opaquely.

---

## 9. The Loop Question: RFC 6761 + System Proxy

**Question:** If the OS/browser proxy is set to `127.0.0.1:9010`, and a request to `myapp.localhost` arrives, will it loop back through Local Panel?

**Answer: No. There is no loop.**

Here is why:

```
Browser navigates to http://myapp.localhost/
         │
         │  (system proxy is 127.0.0.1:9010)
         ▼
Local Panel TCP server receives:
  GET http://myapp.localhost/ HTTP/1.1
  Host: myapp.localhost
         │
         ▼
  host = "myapp.localhost"
  host.endsWith(".localhost") == true
         │
         ▼
  proxyToUpstream("127.0.0.1:3000")
         │
         │  Node.js http.request({ hostname: "127.0.0.1", port: 3000 })
         │  This is a DIRECT connection, NOT through Local Panel
         ▼
  Your actual app on port 3000
```

`proxyToUpstream` uses Node.js's `http.request` which connects directly to the specified `hostname:port`. It does **not** consult the OS proxy settings. It does **not** connect to Local Panel's own port. The chain terminates at your real service.

---

## 10. Requests Panel Replay

The Requests panel lets you re-send a captured request with edits. This uses a completely separate code path called `replayRequest()`.

```
User clicks "Send" in Replay Editor
         │
         ▼
window.api.replayRequest(method, url, headers, body)
         │   (IPC call to Electron main process)
         ▼
replayRequest() in server.ts
         │
         │  http.request / https.request (direct Node.js call)
         │  Does NOT go through 127.0.0.1:9010
         │  Does NOT check mocks
         │  Does NOT check proxy rules
         ▼
  Target server (e.g., api.example.com:443)
```

**Replay requests bypass Local Panel's proxy entirely.** No mock matching, no proxy rules, no logging to the requests log.

---

## 11. WebSocket Connections

The WebSockets panel creates browser-native WebSocket connections:

```
User clicks "Connect" in WebSockets panel
         │
         ▼
new WebSocket(url)   ← browser native API, runs in renderer process
         │
         │  This is a direct WebSocket handshake (HTTP Upgrade)
         │  Does NOT go through Local Panel's TCP server
         │  Does NOT use the system proxy for WebSocket
         ▼
  WebSocket server at target URL
```

**WebSocket connections never touch Local Panel's proxy.** The browser's WebSocket API sends an `HTTP/1.1 101 Switching Protocols` upgrade directly to the target host, bypassing any HTTP proxy configuration.

Up to 5 concurrent WebSocket connections are tracked in a module-level registry in `renderer/lib/useWebSocket.ts`.

---

## 12. Direct Protocol Requests

GraphQL, SOAP, and REST requests initiated from the Request panels use a direct HTTP/HTTPS connection — they do **not** route through the proxy server.

```
User clicks "Send" in GraphQL / SOAP / REST tab
         │
         ▼
window.api.graphqlExecute / soapExecute / replayRequest
         │   (IPC call to Electron main process)
         ▼
Direct http.request / https.request
  (NOT through 127.0.0.1:9010)
  (NOT checking mocks)
  (NOT checking proxy rules)
         ▼
  Target API server
```

This is intentional — the request panels are for sending real requests to real servers, not for testing the proxy pipeline.

---

## 13. gRPC Mock Server

The gRPC mock server is a separate server process, independent of the HTTP proxy:

```
gRPC client (any language)
         │
         │  connects directly to 127.0.0.1:9102
         ▼
┌──────────────────────────────────┐
│  gRPC Mock Server  port 9102     │
│  (started/stopped from UI)       │
│                                  │
│  Matches by: service + method    │
│  Returns: configured JSON body   │
│           converted to protobuf  │
└──────────────────────────────────┘
```

The gRPC mock server:
- Binds to `127.0.0.1:9102` (configurable)
- Requires proto file definitions to be imported
- Does **not** interact with the HTTP proxy server on port 9010
- gRPC clients must explicitly point to port 9102

---

## 14. Complete Traffic Map

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER / APP / gRPC CLIENT                           │
│                                                                                    │
│  *.localhost URL  Forward Proxy    REST/GQL/SOAP     WebSocket     gRPC Client     │
│       │           (abs URL)        Direct Request       │               │           │
│       │               │                │                │               │           │
└───────┼───────────────┼────────────────┼────────────────┼───────────────┼───────────┘
        │               │                │                │               │
        ▼               ▼                │                │               │
┌─────────────────────────────────┐      │                │               │
│  LOCAL PANEL  127.0.0.1:9010   │      │                │               │
│                                 │      │                │               │
│  RFC 6761 path                  │      │                │               │
│    → proxyToUpstream()          │      │                │               │
│                                 │      │                │               │
│  Forward proxy path             │      │                │               │
│    1. REST mock check           │      │                │               │
│    2. GraphQL mock check        │      │                │               │
│    3. SOAP mock check           │      │                │               │
│    4. Proxy rule check          │      │                │               │
│    5. Passthrough               │      │                │               │
│                                 │      │                │               │
│  CONNECT tunnel                 │      │                │               │
│    → raw TCP pipe               │      │                │               │
└─────────────────────────────────┘      │                │               │
        │               │                │                │               │
        └───────────────┼────────────────┘                │               │
                        │                                  │               │
                        ▼                                  ▼               ▼
             ┌─────────────────┐               ┌─────────────┐  ┌──────────────────┐
             │  TARGET SERVER  │               │  WS SERVER  │  │  gRPC MOCK 9102  │
             │  (your app,     │               │  (direct)   │  │  (local server)  │
             │   external API) │               └─────────────┘  └──────────────────┘
             └─────────────────┘
```

---

## 15. Workspace Scoping

Every routing decision is scoped to the active workspace. Before dispatch, `workspaceCfg()` filters:

- `cfg.mappings` → only mappings with `workspaceId === activeWorkspaceId`
- `cfg.proxyRules` → only rules with `workspaceId === activeWorkspaceId`
- `cfg.mocks` → only REST mocks with `workspaceId === activeWorkspaceId`
- `cfg.graphqlMocks` → only GraphQL mocks for the active workspace
- `cfg.soapMocks` → only SOAP mocks for the active workspace

If no workspace is active (`activeWorkspaceId` is null/undefined), all items are visible.

## 14. Summary Table

| Feature | Path through Local Panel | Mock check | Proxy rule check | Logs |
|---|---|---|---|---|
| `*.localhost` navigation | Yes — RFC 6761 path | No | No | Yes |
| HTTP via system proxy | Yes — forward proxy | Yes | Yes | Yes |
| HTTPS CONNECT tunnel | Yes — raw TCP pipe | No | No | No |
| Requests panel replay | No — direct Node.js `http.request` | No | No | No |
| WebSocket connection | No — direct browser WebSocket | No | No | No |
