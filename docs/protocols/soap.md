# SOAP Protocol — Developer Reference

This document describes the internal architecture of Local Panel's SOAP support.

---

## Data Model

### `SavedSoapRequest`

```typescript
interface SavedSoapRequest {
  id: string;
  name: string;
  workspaceId: string;
  folderId?: string;
  endpoint: string;          // HTTP URL of the SOAP service
  soapAction: string;        // SOAPAction header value
  body: string;              // SOAP envelope XML
  headers: HeaderRow[];      // Extra HTTP headers
  preScript?: string;
  postScript?: string;
  wsdlId?: string;           // Reference to a saved WSDL
}
```

### `SavedSoapMock`

```typescript
interface SavedSoapMock {
  id: string;
  name: string;
  workspaceId: string;
  folderId?: string;
  enabled: boolean;
  endpointPattern: string;   // URL to match (exact or regex)
  useRegex: boolean;
  soapActionPattern: string; // SOAPAction header to match
  operationName?: string;    // Optional: match by body operation name
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;      // SOAP response XML
  responseDelay?: number;
}
```

### `SavedWsdl`

```typescript
interface SavedWsdl {
  id: string;
  name: string;
  workspaceId: string;
  content: string;           // Raw WSDL XML
  url?: string;              // Source URL (for refresh)
  savedAt: number;
}
```

---

## Storage Layout

```
{wsId}/
  soapRequests/{id}.json    — request definitions
  soapMocks/{id}.json       — mock definitions
  wsdlFiles/{id}.json       — saved WSDL documents
```

---

## IPC Handlers

All handlers in `src/ipc/handlers.ts` starting at line ~555.

| Channel | Action |
|---|---|
| `soap:addRequest` | Create new request |
| `soap:updateRequest` | Update request |
| `soap:deleteRequest` | Delete request |
| `soap:addMock` | Create new mock |
| `soap:updateMock` | Update mock |
| `soap:deleteMock` | Delete mock |
| `soap:addWsdl` | Save a WSDL |
| `soap:deleteWsdl` | Delete a WSDL |
| `soap:listWsdls` | List saved WSDLs |
| `soap:fetchWsdl` | Fetch WSDL XML from URL |
| `soap:execute` | Execute a SOAP request |

### `soap:fetchWsdl`

Performs an HTTP GET to the specified URL and returns the raw XML body. The renderer parses it and optionally saves it via `soap:addWsdl`.

### `soap:execute`

```typescript
// Input
{ endpoint, soapAction, body, headers, preScript, postScript, activeEnv }

// Flow
1. resolveVars(endpoint, env)
2. resolveVars(body, env)
3. Run preScript if present
4. POST {endpoint}
   Content-Type: text/xml; charset=utf-8
   SOAPAction: "{soapAction}"
   + extra headers
5. Run postScript on response
6. Return { status, headers, body, durationMs }
```

---

## Mock Matching Architecture

Implemented in `src/proxy/protocolMockHandler.ts`.

### `matchSoapMock(mocks, url, headers, bodyStr, env)`

1. Extract `soapAction` from `headers["soapaction"]` (case-insensitive)
2. `extractSoapOperationName(bodyStr)` — regex-parse XML body for the first child element of `<Body>`
3. For each enabled mock:
   a. URL pattern match (exact or regex after `resolveVars`)
   b. SOAPAction match — if `mock.soapActionPattern` is set, test via substring or regex
   c. Operation name match — if `mock.operationName` is set, compare to extracted name

### Operation Name Extraction

```typescript
function extractSoapOperationName(xml: string): string {
  // Find <soap:Body> (any prefix)
  const bodyMatch = /<(?:soap|SOAP|s):Body[^>]*>([\s\S]*?)<\/(?:soap|SOAP|s):Body>/i.exec(xml);
  // Get first child element, strip namespace prefix
  const elementMatch = /<(?:\w+:)?(\w+)/i.exec(bodyContent);
  return elementMatch?.[1] ?? "";
}
```

For a request like:
```xml
<soapenv:Body>
  <tns:GetWeather>
    <tns:city>London</tns:city>
  </tns:GetWeather>
</soapenv:Body>
```
This returns `"GetWeather"`.

---

## WSDL Explorer

`renderer/components/soap/WsdlExplorer.tsx` provides:

1. **WSDL list** — dropdown of saved WSDLs for the workspace
2. **Fetch from URL** — calls `soap:fetchWsdl` to retrieve and optionally save the WSDL
3. **Operation list** — parses WSDL XML to extract:
   - Operation names from `<wsdl:portType>`/`<portType>` elements
   - SOAPAction from `<soap:operation>` elements
   - Target namespace from `targetNamespace` attribute
4. **Click-to-generate** — clicking an operation:
   - Generates a full SOAP envelope with the correct namespace
   - Auto-fills typed placeholders for each input message part
   - Populates the `soapAction` field
   - Calls `onSelectOperation(envelope, soapAction)` to update the editor

### Envelope Generation

Generated envelopes follow this structure:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="{targetNamespace}">
  <soapenv:Header/>
  <soapenv:Body>
    <tns:{operationName}>
      <!-- input elements from message definition -->
    </tns:{operationName}>
  </soapenv:Body>
</soapenv:Envelope>
```

---

## Environment Variable Substitution

Applied in `SoapTab.tsx` before sending:

```typescript
const resolvedEndpoint = resolveVars(endpoint, activeEnv);
const resolvedBody = resolveVars(body, activeEnv);
// Headers resolved per-row
```

`{{VAR}}` tokens in the SOAP envelope body are resolved against the active environment at send time.
