# GraphQL Protocol — Developer Reference

This document describes the internal architecture of Local Panel's GraphQL support.

---

## Data Model

### `SavedGraphQLRequest`

```typescript
interface SavedGraphQLRequest {
  id: string;
  name: string;
  workspaceId: string;
  folderId?: string;
  endpoint: string;          // HTTP URL of the GraphQL server
  query: string;             // GraphQL query/mutation/subscription text
  variables: string;         // JSON string of variables
  headers: HeaderRow[];      // Custom HTTP headers
  preScript?: string;        // Pre-request JavaScript
  postScript?: string;       // Post-response JavaScript
  schemaId?: string;         // Reference to a saved schema
}
```

### `SavedGraphQLMock`

```typescript
interface SavedGraphQLMock {
  id: string;
  name: string;
  workspaceId: string;
  folderId?: string;
  enabled: boolean;
  endpointPattern: string;   // URL to match (exact or regex)
  useRegex: boolean;
  operationType: "query" | "mutation" | "subscription" | "any";
  operationName: string;     // Empty = match any operation name
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;      // Full GraphQL response JSON
  responseDelay?: number;
}
```

### `SavedGraphQLSchema`

```typescript
interface SavedGraphQLSchema {
  id: string;
  name: string;
  workspaceId: string;
  content: string;           // SDL string or introspection JSON string
  url?: string;              // Source URL (for refresh)
  savedAt: number;           // Unix timestamp
}
```

---

## Storage Layout

```
{wsId}/
  graphqlRequests/{id}.json   — request definitions
  graphqlMocks/{id}.json      — mock definitions
  graphqlSchemas/{id}.json    — saved schemas
```

Folder awareness uses the shared `EntityIndex` (`index.json`) with `kind: "graphqlRequest"` and `kind: "graphqlMock"`.

---

## IPC Handlers

All handlers live in `src/ipc/handlers.ts` starting at line ~721.

| Channel | Action |
|---|---|
| `graphql:addRequest` | Create new request entity |
| `graphql:updateRequest` | Update existing request |
| `graphql:deleteRequest` | Delete request |
| `graphql:addMock` | Create new mock |
| `graphql:updateMock` | Update existing mock |
| `graphql:deleteMock` | Delete mock |
| `graphql:addSchema` | Save a schema |
| `graphql:deleteSchema` | Delete a schema |
| `graphql:listSchemas` | List all saved schemas |
| `graphql:introspect` | Execute introspection query against URL |
| `graphql:execute` | Execute a GraphQL request |

### `graphql:introspect`

Sends the standard introspection query to the specified URL:

```http
POST {url}
Content-Type: application/json

{ "query": "{ __schema { queryType { name } types { name kind fields { name } } } }" }
```

Returns the parsed response body. The renderer stores it as a schema via `graphql:addSchema`.

### `graphql:execute`

```typescript
// Input
{ endpoint, query, variables, headers, preScript, postScript, activeEnv }

// Flow
1. resolveVars(endpoint, env)
2. resolveVars(variables, env)
3. Run preScript if present
4. POST {endpoint} with JSON body { query, variables: parsedVars, operationName }
5. Run postScript on response
6. Return { status, headers, body, durationMs }
```

---

## Mock Matching Architecture

Proxy-level GraphQL mock matching is implemented in `src/proxy/protocolMockHandler.ts`.

### `matchGraphQLMock(mocks, url, bodyStr, env)`

1. Parse `bodyStr` as JSON — if it fails, skip (not a GraphQL request)
2. Extract `query` and `operationName` from parsed body
3. `detectOperationType(query)` — reads the first keyword (`query`/`mutation`/`subscription` or `{`)
4. For each enabled mock:
   a. URL pattern match (exact or regex after `resolveVars`)
   b. Operation type check (skip if `mock.operationType !== "any"` and doesn't match)
   c. Operation name check — compares against `operationName` field OR extracted name from query text

### Operation Name Extraction

```typescript
// From operationName field in request body (preferred)
parsedOpName = parsed.operationName ?? ""

// Fallback: regex parse from query string
/^(?:query|mutation|subscription)\s+(\w+)/m.exec(query.trim())
```

---

## Schema Explorer

`renderer/components/graphql/SchemaExplorer.tsx` provides:

1. **Schema list** — dropdown to select saved schemas for the current workspace
2. **Introspect button** — calls `graphql:introspect` with the tab's endpoint
3. **Operation browser** — parses introspection JSON to extract:
   - Query type fields
   - Mutation type fields
   - Subscription type fields
4. **Click-to-generate** — clicking an operation:
   - Generates a query skeleton with all scalar fields
   - Generates a variables template from argument types
   - Calls `onSelectOperation(query, variables)` to populate the editor

### SDL Parsing

When a saved schema is plain SDL (not introspection JSON), the explorer:
- Extracts `type Query { ... }`, `type Mutation { ... }`, `type Subscription { ... }` blocks via regex
- Lists field names within each type
- Cannot resolve nested type variables (only top-level operations)

---

## Environment Variable Substitution

Applied in `GraphQLTab.tsx` before sending:

```typescript
const resolvedEndpoint = resolveVars(endpoint, activeEnv);
const resolvedVariables = resolveVars(variables, activeEnv);
// Headers resolved per-row
```

The `resolveVars` function from `renderer/lib/bodyUtils.ts` handles `{{VAR}}` replacement using the active environment's variable list.
</content>
</invoke>