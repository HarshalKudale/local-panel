# gRPC Protocol — Developer Reference

This document describes the internal architecture of Local Panel's gRPC support.

---

## Data Model

### `SavedGrpcRequest`

```typescript
interface SavedGrpcRequest {
  id: string;
  name: string;
  workspaceId: string;
  folderId?: string;
  serverAddress: string;     // host:port of the gRPC server
  service: string;           // Fully-qualified service name
  method: string;            // RPC method name
  streamingType: "unary" | "server" | "client" | "bidi";
  body: string;              // JSON request message
  metadata: HeaderRow[];     // gRPC metadata (headers)
  preScript?: string;
  postScript?: string;
  protoId?: string;          // Reference to a saved proto file
  useTls: boolean;
}
```

### `SavedGrpcMock`

```typescript
interface SavedGrpcMock {
  id: string;
  name: string;
  workspaceId: string;
  folderId?: string;
  enabled: boolean;
  service: string;           // Service name to match
  method: string;            // Method name to match
  responseBody: string;      // JSON response message
  responseStatus: number;    // gRPC status code (0 = OK)
  responseStatusMessage?: string;
  responseMetadata?: Record<string, string>;
  responseDelay?: number;
  streamingResponses?: string[]; // For streaming: array of JSON messages
  protoId?: string;
}
```

### `SavedProtoFile`

```typescript
interface SavedProtoFile {
  id: string;
  name: string;
  workspaceId: string;
  content: string;           // Full .proto file text
  savedAt: number;
}
```

---

## Storage Layout

```
{wsId}/
  grpcRequests/{id}.json    — request definitions
  grpcMocks/{id}.json       — mock definitions
  protoFiles/{id}.json      — saved .proto file contents
```

---

## IPC Handlers

All handlers in `src/ipc/handlers.ts` starting at line ~903.

| Channel | Action |
|---|---|
| `grpc:addRequest` | Create new request |
| `grpc:updateRequest` | Update request |
| `grpc:deleteRequest` | Delete request |
| `grpc:addMock` | Create new mock |
| `grpc:updateMock` | Update mock |
| `grpc:deleteMock` | Delete mock |
| `grpc:addProtoFile` | Save a proto file |
| `grpc:deleteProtoFile` | Delete a proto file |
| `grpc:listProtoFiles` | List saved proto files |
| `grpc:execute` | Execute a gRPC call |
| `grpc:reflect` | Use server reflection to discover services |
| `grpc:mockServerStatus` | Get mock server running state |
| `grpc:startMockServer` | Start the gRPC mock server |
| `grpc:stopMockServer` | Stop the gRPC mock server |

### `grpc:execute`

> **Note:** Full gRPC execution requires `@grpc/grpc-js` as a runtime dependency. The current implementation returns a stub error if the library is not installed. Add `@grpc/grpc-js` and `@grpc/proto-loader` to `dependencies` in `package.json` to enable live gRPC calls.

```typescript
// Input
{ serverAddress, service, method, streamingType, body, metadata, protoContent, useTls, activeEnv }

// Flow (when @grpc/grpc-js is available)
1. Load proto definition from protoContent via @grpc/proto-loader
2. Create gRPC client credentials (insecure or TLS)
3. Resolve env vars in body and metadata
4. Invoke the RPC method
5. For streaming: collect all messages, return as array
6. Return { status, metadata, body, durationMs }
```

### `grpc:reflect`

Server reflection allows clients to discover services without a proto file. The handler:
1. Connects to the gRPC server using the reflection service proto
2. Lists available services
3. Retrieves file descriptors for each service
4. Returns serialized proto descriptors that can be parsed into a proto file

### gRPC Mock Server

The mock server (`grpc:startMockServer`) starts a gRPC server on port 9102:
- Loads registered mock definitions
- Dynamically registers service implementations from loaded proto files
- Returns configured JSON responses (serialized to protobuf)
- Supports status code simulation for error testing

---

## Proto Explorer

`renderer/components/grpc/ProtoExplorer.tsx` provides:

1. **Proto file list** — lists saved proto files for the workspace
2. **Import .proto** — reads a `.proto` file from disk and saves it via `grpc:addProtoFile`
3. **Server reflection** — calls `grpc:reflect` with the current server address
4. **Service/method browser** — parses proto content to extract:
   - Service definitions via regex: `/service\s+(\w+)\s*\{([\s\S]*?)\}/g`
   - RPC methods with streaming flags: `/rpc\s+(\w+)\s*\((stream\s+)?(\w+)\)\s*returns\s*\((stream\s+)?(\w+)\)/g`
5. **Click-to-populate** — clicking a method:
   - Sets the service and method fields in the request tab
   - Detects streaming type from `stream` keywords in the RPC definition
   - Generates a JSON skeleton from the input message type definition
   - Calls `onSelectMethod(service, method, streamingType, bodySkeleton)` to update the editor

### Streaming Type Detection

| Client input | Server output | `streamingType` |
|---|---|---|
| Not stream | Not stream | `"unary"` |
| Not stream | `stream` | `"server"` |
| `stream` | Not stream | `"client"` |
| `stream` | `stream` | `"bidi"` |

### Message Skeleton Generation

For a message definition:
```proto
message GetUserRequest {
  string user_id = 1;
  int32 limit = 2;
  bool include_deleted = 3;
}
```
The explorer generates:
```json
{
  "user_id": "",
  "limit": 0,
  "include_deleted": false
}
```

Type defaults: `string` → `""`, `int32/int64/float/double` → `0`, `bool` → `false`, `bytes` → `""`, others → `null`.

---

## gRPC Mock Server Architecture

The mock server is separate from the HTTP proxy (port 9010). It runs on port 9102 (default).

```
gRPC Client
    │ connects to localhost:9102
    ▼
gRPC Mock Server (port 9102)
    │ matches: service + method name
    ▼
Returns configured JSON response
(converted to protobuf message)
```

**Key difference from HTTP mocks:** The gRPC mock server requires clients to connect directly to port 9102. There is no proxy interception for gRPC traffic (gRPC uses HTTP/2 framing that is not transparently proxied by Local Panel's TCP server).

---

## Environment Variable Substitution

Applied in `GrpcTab.tsx` before sending:

```typescript
const resolvedBody = resolveVars(body, activeEnv);
// Metadata resolved per-row
```

`{{VAR}}` tokens in the JSON message body are resolved before the message is serialized to protobuf.

---

## Port Allocation

| Port | Service | Configurable |
|---|---|:---:|
| 9010 | HTTP proxy server | ✓ |
| 9101 | Webhook receiver | ✓ |
| 9271 | Companion WebSocket | ✓ |
| 9102 | gRPC mock server | ✓ |
