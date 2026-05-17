# Browser Extension

The Local Panel browser extension integrates directly with Chrome DevTools for seamless traffic capture and proxy management.

---

## Installation

### From Source (Developer Mode)
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder from the Local Panel repository
5. The extension icon appears in your toolbar

### From Chrome Web Store
Coming soon.

---

## Features

### Popup — Proxy Toggle
Click the extension icon to open the popup:
- **Enable/Disable proxy**: One-click toggle to route browser traffic through Local Panel
- **Proxy port**: Configure which port Local Panel's proxy server is on (default: 9010)
- **Companion port**: Configure the companion WebSocket bridge port (default: 9012)

When enabled, the extension sets a PAC (Proxy Auto-Config) script that routes HTTP traffic through Local Panel.

### DevTools Panel
Open Chrome DevTools (`F12`) → Navigate to the **Local Panel** tab:
- **Live traffic capture**: See all network requests made by the page
- **Full request/response detail**: Method, URL, headers, body, status, timing
- **Send to Local Panel**: Click any captured request to:
  - Create a **Mock** from the request/response
  - Save as a **Request** in your workspace
- **Bulk operations**: Select multiple requests for batch mock creation

### Context Menu
Right-click any link or page:
- **Send URL to Local Panel**: Creates a saved request with the URL pre-filled

---

## How It Works

### Proxy Configuration
The extension uses Chrome's `chrome.proxy` API to set a PAC script:
```javascript
function FindProxyForURL(url, host) {
  return "PROXY 127.0.0.1:9010; DIRECT";
}
```
This routes all HTTP traffic through Local Panel while falling back to direct connection if the proxy is unavailable.

### Companion Bridge
The extension communicates with Local Panel via a localhost WebSocket connection (the "companion server"):
- Extension connects to `ws://127.0.0.1:9012`
- Sends captured requests as structured messages
- Local Panel creates entities and refreshes its UI

### Security
- All communication is localhost-only (`127.0.0.1`)
- The companion server only accepts additive operations (create mock, create request)
- No authentication beyond localhost binding
- No sensitive data is transmitted externally

---

## Protocol Coverage

The browser extension captures **REST (HTTP/HTTPS) traffic only**. Some notes on protocol-specific behaviour:

| Protocol | Captured by extension? | Notes |
|---|:---:|---|
| REST (HTTP/JSON) | ✓ | Fully captured in DevTools panel |
| GraphQL over HTTP | Partial | Captured as raw HTTP POST; displayed as REST. Body contains the GraphQL payload but is not parsed into operations. |
| SOAP over HTTP | Partial | Captured as raw HTTP POST with XML body. Not displayed as a SOAP envelope. |
| gRPC | ✗ | Uses HTTP/2 framing — not captured by the extension's `webRequest` API |
| WebSocket | ✗ | WS upgrade is not captured; use the WebSockets panel in Local Panel directly |

For GraphQL and SOAP requests you want to save or mock, use the **Request → GraphQL** or **Request → SOAP** panels in Local Panel directly.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Extension can't connect | Ensure Local Panel is running and companion port matches |
| Proxy not working | Check that the proxy port in extension matches Local Panel settings |
| DevTools panel empty | Refresh the page after opening DevTools |
| HTTPS sites show errors | Install and trust the Local Panel CA certificate |

---

## Permissions

The extension requires:
- `proxy` — To configure browser proxy settings
- `webRequest` — To observe network traffic in DevTools
- `devtools` — To create the DevTools panel
- `contextMenus` — For right-click integration
- `storage` — To persist port configuration
