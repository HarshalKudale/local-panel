# User Guide

Detailed usage instructions for every Local Panel feature.

---

## Mappings

Mappings create friendly `.localhost` domains for your local services.

### Creating a Mapping
1. Navigate to **Mappings** panel
2. Click **+ Add Mapping**
3. Enter a domain name (e.g., `api` becomes `api.localhost`)
4. Enter the target host and port (e.g., `127.0.0.1:3000`)
5. Optionally add a label for identification
6. Save — the mapping is immediately active

### How Domain Resolution Works
Browsers resolve `*.localhost` to `127.0.0.1` per RFC 6761. When traffic arrives at Local Panel with a `.localhost` host header, it looks up the matching mapping and proxies the request to your configured target.

### Quick Mapping from Services
The **Services** panel shows all listening ports. Click the map icon next to any service to pre-fill a new mapping with that port.

---

## REST Mocks

REST mocks intercept HTTP requests and return configured responses without hitting real servers.

> For GraphQL, SOAP, and gRPC mocks, see the dedicated sections below.

### Creating a REST Mock
1. Navigate to **Mock → REST** in the sidebar
2. Click **+ New Mock** in the sidebar
3. Configure:
   - **Method**: GET, POST, PUT, DELETE, PATCH, or * (any)
   - **URL Pattern**: Exact URL or regex
   - **Response Status**: HTTP status code
   - **Response Headers**: Key-value pairs
   - **Response Body**: JSON, text, HTML, or binary (base64)
4. Save and enable

### URL Matching
- **Exact match**: The full URL must equal the pattern (e.g., `http://api.example.com/users`)
- **Regex match**: Toggle regex mode, then use patterns like `.*\/api\/users.*`
- Priority: First enabled mock that matches wins

### Advanced Mock Features
- **Response delay**: Add artificial latency (ms) to simulate slow APIs
- **SSE streaming**: Configure Server-Sent Events responses
- **Chunked streaming**: Return response in chunks over time
- **Binary bodies**: Upload or paste base64-encoded binary data
- **Variable substitution**: Use `{{VAR_NAME}}` in body/headers

### Creating Mocks from Captures
Right-click any entry in the Capture panel → "Create Mock" to auto-fill a mock with the captured request/response.

---

## Proxy Rules

Proxy rules redirect matching traffic to different targets, with optional script-based mutation.

### Creating a Rule
1. Navigate to **Proxy Rules** panel
2. Click **+ Add Rule**
3. Configure:
   - **Pattern**: URL string or regex to match against
   - **Target**: Select a mapping as the redirect destination
   - **Request Script** (optional): JavaScript to modify the request
   - **Response Script** (optional): JavaScript to modify the response
4. Save and enable

### Script Examples

**Request script** (modify before forwarding):
```javascript
// Add an auth header
request.headers['Authorization'] = 'Bearer my-token';
// Change the path
request.url = request.url.replace('/v1/', '/v2/');
```

**Response script** (modify before returning):
```javascript
// Override status
response.status = 200;
// Inject CORS headers
response.headers['Access-Control-Allow-Origin'] = '*';
```

### Rule Exclusivity
Only one rule can be enabled per URL pattern (static or regex). When you enable a rule, any other previously enabled rule sharing the same pattern is automatically disabled. There is no manual ordering or drag-and-drop priority.

---

## REST Requests

The REST panel is a full HTTP client for testing APIs.

> For GraphQL, SOAP, and gRPC clients, see the dedicated sections below.

### Sending a Request
1. Navigate to **Request → REST** in the sidebar
2. Create or open a request tab
3. Set method, URL, headers, and body
4. Click **Send**
5. View response status, headers, body, and timing

### Body Modes
- **None**: No request body
- **Raw**: JSON, XML, plain text, or custom content-type
- **Form Data**: Multipart form with key-value pairs and file uploads
- **Binary**: Upload a binary file as the request body

### cURL Import
Paste a cURL command directly into the URL bar or use the import button. Local Panel parses it into a full request definition.

### Pre/Post Scripts
- **Pre-request script**: Runs before sending (set dynamic headers, generate tokens)
- **Post-response script**: Runs after receiving (assert values, extract data)

---

## WebSocket Client

Interactive WebSocket connections for testing real-time APIs.

### Connecting
1. Navigate to **WebSockets** panel
2. Create a new connection
3. Enter the WebSocket URL (e.g., `ws://localhost:8080/ws`)
4. Optionally add headers
5. Click **Connect**

### Sending Messages
Type a message in the input field and click Send. Messages appear in the conversation log with timestamps and direction indicators.

### Connection Limits
Maximum 5 concurrent WebSocket connections across all tabs.

---

## Webhooks

Receive and inspect incoming webhook payloads.

### Setting Up a Webhook
1. Navigate to **Webhooks** panel
2. Create a new webhook endpoint
3. Give it a slug (e.g., `github-push`)
4. Open the tab to activate it
5. The webhook URL is: `http://localhost:{webhookPort}/localpanel/webhooks/{slug}`
6. Configure your external service to POST to this URL

### Viewing Payloads
When a POST arrives at your webhook endpoint, the payload appears in real-time in the tab. View headers and body of each received request.

### Webhook Server
The webhook server runs on a separate port (default 9101). Start/stop it from the panel header.

---

## Environments

Variable sets for dynamic value substitution.

### Creating an Environment
1. Navigate to **Environments** panel
2. Click **+ Add Environment**
3. Name it (e.g., "Production", "Staging", "Local")
4. Add key-value pairs

### Using Variables
Use `{{VARIABLE_NAME}}` anywhere:
- Mock response bodies and headers
- Request URLs, headers, and bodies
- WebSocket URLs
- Health check URLs

### Built-in Randomizers
Use these tokens for dynamic test data:
- `{{random.uuid}}` — `550e8400-e29b-41d4-a716-446655440000`
- `{{random.email}}` — `user_abc@example.com`
- `{{random.name}}` — `John Smith`
- `{{random.int}}` — `42`
- `{{random.float}}` — `3.14`
- `{{random.date}}` — `2024-03-15T10:30:00Z`
- `{{random.boolean}}` — `true`
- `{{random.hex}}` — `a1b2c3d4`

---

## Health Bar

Monitor endpoint availability at a glance.

### Adding a Health Check
1. Navigate to **Health Bar** panel
2. Click **+ Add Service**
3. Enter a name and URL (supports `{{ENV_VAR}}` substitution)
4. Optionally flag for auto-refresh on panel open

### Running Checks
- Click the refresh icon on individual services
- Click **Check All** to run all checks simultaneously
- View response status, time, headers, and body for each

---

## TLS / HTTPS Interception

Enable inspection of encrypted traffic.

### Setup
1. Go to **Settings** → TLS section
2. **Generate CA**: Creates a local Certificate Authority
3. **Install CA**: Adds the CA to your OS trust store
4. **Enable TLS Interception**: Activates MITM for CONNECT tunnels

### How It Works
With TLS enabled, Local Panel terminates the TLS connection, inspects the plaintext HTTP request (checking mocks and rules), then re-encrypts and forwards to the upstream. Per-host certificates are generated on demand.

### Security Note
The generated CA is local to your machine. Never share the CA private key. The CA only intercepts traffic explicitly routed through Local Panel.

---

## Version Control & Sync

### Publishing Changes
1. Make changes to any entity (mapping, mock, rule, etc.)
2. A colored dot appears indicating the change status:
   - 🟡 Modified — existing entity changed
   - 🔴 New — newly created entity
   - ⚪ Deleted — entity was removed
3. Click **Publish** in the footer to commit changes
4. Or right-click an entity → Publish individual changes

### Restoring
Right-click any modified entity → **Restore** to revert to the last committed version.

### History
Click the history icon on any entity to view its git log with diffs.

### Remote Sync
1. Go to **Workspace** panel
2. Configure a remote git URL
3. **Push**: Upload your workspace state to the remote
4. **Pull**: Download changes from the remote
5. Enable **Auto-sync** for periodic push/pull

---

## Import & Export

### Importing
1. Click the import/export icon in any panel header
2. Select **Import**
3. Choose a file — format is auto-detected:
   - `.json` — Local Panel, Postman, Insomnia, WireMock
   - `.yaml` / `.yml` — OpenAPI
   - `.har` — HTTP Archive
   - `.env` — dotenv
   - `.zip` — Full workspace archive
   - `.txt` — cURL commands
4. Review collision warnings
5. Confirm import

### Exporting
1. Click the import/export icon
2. Select **Export**
3. Choose format and scope (all or selected entities)
4. Save the file

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New entity | `Ctrl+N` |
| Save | `Ctrl+S` |
| Close tab | `Ctrl+W` |
| Switch tab | `Ctrl+Tab` |
| Search | `Ctrl+F` |
| Toggle sidebar | `Ctrl+B` |

---

## GraphQL Requests

Send GraphQL queries, mutations, and subscriptions to any GraphQL endpoint.

### Sending a GraphQL Request
1. Navigate to **Request → GraphQL**
2. Click **+ New Request**
3. Enter the endpoint URL (e.g., `https://api.example.com/graphql`)
4. Write your query in the **Query** tab
5. Add variables in the **Variables** tab (JSON format)
6. Add custom headers in the **Headers** tab
7. Click **Send**

### Schema Introspection
1. Open the **Schema** tab in any GraphQL request
2. Click **Introspect** to fetch the schema from the server
3. Browse types, queries, mutations, and subscriptions
4. Click any operation to auto-generate a query skeleton and variables
5. Save schemas for reuse across requests

### Importing a Schema
In the **Schema** tab, select a saved schema from the dropdown or click **+ Save Schema** after introspection. Saved schemas are workspace-level and available to all GraphQL requests.

### Pre/Post Scripts
GraphQL requests support the same pre/post script mechanism as REST. The response body will be the full JSON response including the `data` and `errors` fields.

### Variables
Variables use the standard GraphQL variables format:
```json
{ "userId": "abc123", "limit": 10 }
```
Use `{{ENV_VAR}}` tokens inside variable values for environment substitution.

---

## GraphQL Mocks

Intercept GraphQL operations and return configured responses without hitting a real server.

### Creating a GraphQL Mock
1. Navigate to **Mock → GraphQL**
2. Click **+ New Mock**
3. Configure:
   - **Endpoint Pattern**: URL to match (exact or regex)
   - **Operation Type**: `query`, `mutation`, `subscription`, or `any`
   - **Operation Name**: Optional — match a specific named operation only
   - **Response Body**: JSON response (the full GraphQL response format)
4. Save and enable

### Operation Matching
GraphQL mocks match incoming requests by:
1. **Endpoint URL** — must match the endpoint pattern
2. **Operation type** — determined by parsing the `query` field in the request body
3. **Operation name** — matched against the `operationName` field or extracted from the query string

Example: a mock with `operationType: "query"`, `operationName: "GetUser"` only fires when a request sends `{ "query": "query GetUser { ... }", "operationName": "GetUser" }`.

### Response Format
The response body should be a valid GraphQL response:
```json
{
  "data": {
    "user": { "id": "1", "name": "{{random.name}}" }
  }
}
```
Use `{{VAR}}` tokens for environment variable substitution.

---

## SOAP Requests

Send SOAP/XML requests to web services, with WSDL-driven operation discovery.

### Sending a SOAP Request
1. Navigate to **Request → SOAP**
2. Click **+ New Request**
3. Enter the service endpoint URL
4. Write or paste a SOAP envelope in the **Body** tab
5. Add headers (including `SOAPAction`) in the **Headers** tab
6. Click **Send**

### WSDL Discovery
1. Open the **WSDL** tab in any SOAP request
2. Enter the WSDL URL and click **Fetch** (or paste WSDL content directly)
3. Browse available operations with their SOAPAction values
4. Click an operation to auto-generate a complete SOAP envelope with typed placeholders
5. Save WSDLs for reuse across requests

### SOAP Envelope Auto-generation
Clicking an operation in the WSDL explorer generates a fully-formed SOAP envelope:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:tns="https://service.example.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <tns:GetWeather>
      <tns:city>?</tns:city>
    </tns:GetWeather>
  </soapenv:Body>
</soapenv:Envelope>
```
Replace the `?` placeholders with actual values before sending.

### SOAPAction Header
The `SOAPAction` header is auto-populated from the WSDL when you click an operation. SOAP 1.1 services require this header; SOAP 1.2 services use `Content-Type: application/soap+xml; action="..."` instead.

---

## SOAP Mocks

Intercept SOAP requests and return configured XML responses.

### Creating a SOAP Mock
1. Navigate to **Mock → SOAP**
2. Click **+ New Mock**
3. Configure:
   - **Endpoint Pattern**: URL to match (exact or regex)
   - **SOAPAction Pattern**: Match the `SOAPAction` header (exact substring or regex)
   - **Operation Name** (optional): Match by operation name extracted from the XML body
   - **Response Body**: SOAP response envelope XML
4. Save and enable

### Matching Logic
SOAP mocks match by:
1. **Endpoint URL** — matches the endpoint pattern
2. **SOAPAction** — matches the `SOAPAction` header value
3. **Operation name** — optionally matches the first child element of the `<Body>` element

### Response Format
Return a valid SOAP response envelope:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <GetWeatherResponse>
      <Temperature>22</Temperature>
    </GetWeatherResponse>
  </soapenv:Body>
</soapenv:Envelope>
```

---

## gRPC Requests

Make gRPC calls using proto definitions or server reflection.

### Sending a gRPC Request
1. Navigate to **Request → gRPC**
2. Click **+ New Request**
3. Enter the server address (e.g., `localhost:50051`)
4. Import a `.proto` file or use **Server Reflection**
5. Select a **Service** and **Method** from the dropdowns
6. Fill in the request message as JSON in the **Message** tab
7. Add metadata (gRPC headers) in the **Metadata** tab
8. Click **Invoke**

### Proto Files
1. Open the **Proto** tab in any gRPC request
2. Click **Import .proto** to load a protocol buffer definition file
3. Saved proto files are workspace-level and shared across all gRPC requests
4. The explorer shows all services, methods, and their streaming types

### Server Reflection
If the gRPC server supports reflection (most development servers do):
1. Open the **Proto** tab
2. Click **Server Reflection** with the server address filled in
3. The available services and methods are populated automatically

### Streaming Types
Local Panel displays the streaming type for each method:

| Badge | Type | Description |
|---|---|---|
| **Unary** | Request-response | One request, one response |
| **Server** | Server streaming | One request, stream of responses |
| **Client** | Client streaming | Stream of requests, one response |
| **Bidi** | Bidirectional streaming | Stream of requests, stream of responses |

### Request Message Format
The message body uses JSON that maps to the proto message fields:
```json
{ "name": "World", "timeout": 30 }
```
Use `{{ENV_VAR}}` tokens for environment substitution.

---

## gRPC Mocks

Run a local gRPC mock server that responds to proto-defined service calls.

### Setting Up a gRPC Mock Server
1. Navigate to **Mock → gRPC**
2. Ensure a proto file is imported (see **Proto Files** above)
3. Click **+ New Mock**
4. Configure:
   - **Service**: The gRPC service name
   - **Method**: The RPC method to mock
   - **Response Body**: JSON matching the response message type
   - **Status Code**: gRPC status code (0 = OK, 2 = UNKNOWN, etc.)
5. Save and enable

### Starting the Mock Server
Click **Start Mock Server** in the panel header. The server starts on port `9102` (configurable in Settings). gRPC clients can connect to `localhost:9102`.

### Simulating Errors
Set a non-zero gRPC status code to return an error response:
- `0` — OK
- `2` — UNKNOWN
- `3` — INVALID_ARGUMENT
- `5` — NOT_FOUND
- `13` — INTERNAL
- `14` — UNAVAILABLE

### Streaming Responses
Configure streaming responses in the **Settings** tab of a mock. Define multiple response messages as a JSON array — each element is sent as a separate stream message.

---

## Schema Management

GraphQL schemas, WSDLs, and proto files are managed at the workspace level and shared across all requests.

### GraphQL Schemas
- Stored under **Request → GraphQL → Schema** tab
- Save after introspection or paste SDL directly
- Reuse across multiple GraphQL request tabs

### WSDLs
- Stored under **Request → SOAP → WSDL** tab
- Fetch from URL or paste WSDL XML content
- Auto-generates envelopes for all discovered operations

### Proto Files
- Stored under **Request → gRPC → Proto** tab
- Import `.proto` files from disk
- Shared across all gRPC request and mock tabs
