import * as net from "net";
import { MockRule, Environment } from "@/store/config";
import { HOP_BY_HOP } from "@/proxy/constants";
import { resolveRandomizers } from "@/lib/randomizer";

export function resolveVars(text: string, env: Environment | null): string {
  if (!text) return text;
  let result = text;
  if (env) {
    result = result.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      if (key.startsWith("random.")) return _match;
      const v = env.variables.find((v) => v.key === key);
      return v !== undefined ? v.value : _match;
    });
  }
  return resolveRandomizers(result);
}

export function matchMock(mocks: MockRule[], method: string, url: string, env: Environment | null): MockRule | null {
  for (const m of mocks) {
    if (!m.enabled) continue;
    if (m.method !== "*" && m.method.toUpperCase() !== method.toUpperCase()) continue;
    try {
      const pattern = resolveVars(m.urlPattern, env);
      const hit = m.useRegex
        ? new RegExp(pattern).test(url)
        : url === pattern;
      if (hit) return m;
    } catch { /* invalid regex */ }
  }
  return null;
}

const SKIP_MOCK_RES_HEADERS = new Set([
  ...Array.from(HOP_BY_HOP),
  "content-length",
  "content-encoding",
]);

export function serveMock(socket: net.Socket, mock: MockRule, env: Environment | null): void {
  const delayMs = mock.responseDelay && mock.responseDelay > 0 ? mock.responseDelay : 0;

  // Route to streaming handler if applicable
  if (mock.streamingMode && mock.streamingMode !== "none") {
    const doStream = () => serveStreamingMock(socket, mock, env);
    if (delayMs > 0) setTimeout(doStream, delayMs);
    else doStream();
    return;
  }

  const send = () => {
    if (!socket.writable) return;
    const isBinary = mock.responseBodyEncoding === "base64";
    const body = isBinary
      ? Buffer.from(mock.responseBody, "base64")
      : Buffer.from(resolveVars(mock.responseBody, env), "utf-8");
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(mock.responseHeaders)) {
      if (!SKIP_MOCK_RES_HEADERS.has(k.toLowerCase())) headers[k] = isBinary ? v : resolveVars(v, env);
    }
    if (!headers["content-type"]) headers["content-type"] = isBinary ? "application/octet-stream" : "application/json";
    headers["content-length"] = String(body.length);
    headers["connection"] = "close";

    let head = `HTTP/1.1 ${mock.responseStatus} ${statusText(mock.responseStatus)}\r\n`;
    for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`;
    head += "\r\n";

    socket.write(head);
    socket.write(body);
    socket.end();
  };

  if (delayMs > 0) {
    setTimeout(send, delayMs);
  } else {
    send();
  }
}

export function serveStreamingMock(socket: net.Socket, mock: MockRule, env: Environment | null): void {
  if (!socket.writable) return;

  const chunkDelay = mock.streamingChunkDelay ?? 100;
  const resolvedBody = mock.responseBodyEncoding === "base64"
    ? mock.responseBody
    : resolveVars(mock.responseBody, env);

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(mock.responseHeaders)) {
    if (!SKIP_MOCK_RES_HEADERS.has(k.toLowerCase())) headers[k] = resolveVars(v, env);
  }

  if (mock.streamingMode === "sse") {
    // SSE mode: split by double-newline, send as events
    headers["content-type"] = headers["content-type"] || "text/event-stream";
    headers["cache-control"] = "no-cache";
    headers["connection"] = "keep-alive";
    headers["transfer-encoding"] = "chunked";

    let head = `HTTP/1.1 ${mock.responseStatus} ${statusText(mock.responseStatus)}\r\n`;
    for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`;
    head += "\r\n";
    socket.write(head);

    const events = resolvedBody.split("\n\n").filter(Boolean);
    let idx = 0;

    const sendNext = () => {
      if (!socket.writable || idx >= events.length) {
        // Send terminal chunk and end
        if (socket.writable) {
          socket.write("0\r\n\r\n");
          socket.end();
        }
        return;
      }
      const event = events[idx] + "\n\n";
      const chunk = Buffer.from(event, "utf-8");
      socket.write(`${chunk.length.toString(16)}\r\n`);
      socket.write(chunk);
      socket.write("\r\n");
      idx++;
      setTimeout(sendNext, chunkDelay);
    };
    sendNext();
  } else {
    // Chunked mode: split by separator
    const separator = mock.streamingChunkSeparator ?? "\n\n";
    headers["transfer-encoding"] = "chunked";
    headers["connection"] = "keep-alive";
    if (!headers["content-type"]) headers["content-type"] = "application/json";

    let head = `HTTP/1.1 ${mock.responseStatus} ${statusText(mock.responseStatus)}\r\n`;
    for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`;
    head += "\r\n";
    socket.write(head);

    const chunks = resolvedBody.split(separator).filter(Boolean);
    let idx = 0;

    const sendNext = () => {
      if (!socket.writable || idx >= chunks.length) {
        if (socket.writable) {
          socket.write("0\r\n\r\n");
          socket.end();
        }
        return;
      }
      const data = chunks[idx] + (idx < chunks.length - 1 ? separator : "");
      const chunk = Buffer.from(data, "utf-8");
      socket.write(`${chunk.length.toString(16)}\r\n`);
      socket.write(chunk);
      socket.write("\r\n");
      idx++;
      setTimeout(sendNext, chunkDelay);
    };
    sendNext();
  }
}

export function statusText(code: number): string {
  const map: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 409: "Conflict",
    422: "Unprocessable Entity", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
  };
  return map[code] ?? "Unknown";
}
