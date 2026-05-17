import React, { useState } from "react";
import { RequestLogEntry, MockRule, SavedRequest } from "@/types";
import { ArrowUpRight, Zap, X } from "@/lib/icons";
import CodeEditor, { EditorLanguage } from "@/components/common/CodeEditor";
import BinaryViewer from "@/components/common/BinaryViewer";
import { isBinaryContentType } from "@/lib/bodyUtils";

function b64ToText(b64: string): string {
  if (!b64) return "";
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch { return b64; }
}

function tryFormat(text: string): string {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

function statusColor(s: number | null): string {
  if (s === null) return "text-text-dim";
  if (s < 300) return "text-green";
  if (s < 400) return "text-yellow";
  return "text-red";
}

function HeaderTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return <p className="text-xs text-text-dim italic px-3 py-2">No headers</p>;
  return (
    <table className="w-full border-collapse">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b border-border/40 last:border-0">
            <td className="px-3 py-1.5 text-[11px] font-mono text-text-dim whitespace-nowrap align-top w-48">{k}</td>
            <td className="px-3 py-1.5 text-[11px] font-mono text-text-bright break-all">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type PaneTab = "headers" | "body";

function ctToLang(ct: string): EditorLanguage {
  if (ct.includes("json"))              return "json";
  if (ct.includes("html"))              return "html";
  if (ct.includes("xml"))               return "xml";
  if (ct.includes("javascript") || ct.includes("ecmascript")) return "javascript";
  return "text";
}

function Pane({ title, headers, body }: { title: string; headers: Record<string, string>; body: string }) {
  const [tab, setTab] = useState<PaneTab>("body");
  const ct = (headers["content-type"] ?? headers["Content-Type"] ?? "").toLowerCase();
  const isBinary = isBinaryContentType(ct);
  const bodyText = isBinary ? "" : b64ToText(body);
  const lang = ctToLang(ct);
  const displayBody = lang === "json" ? tryFormat(bodyText) : bodyText;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2 pb-0 flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-dim">{title}</span>
        <div className="flex border-b border-transparent gap-1">
          {(["body", "headers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-[10px] font-medium capitalize cursor-pointer transition-colors rounded-t ${
                tab === t ? "bg-bg2 text-text-bright border border-border border-b-bg2" : "text-text-dim hover:text-text-base"
              }`}
            >
              {t}{t === "headers" ? ` (${Object.keys(headers).length})` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden border border-border rounded mx-3 mb-3 mt-1">
        {tab === "body" ? (
          isBinary && body
            ? <BinaryViewer data={body} contentType={ct.split(";")[0].trim()} />
            : displayBody
              ? <CodeEditor value={displayBody} readOnly language={lang} className="h-full" />
              : <p className="font-mono text-[11px] text-text-dim italic p-3">empty body</p>
        ) : (
          <div className="overflow-auto h-full bg-bg2">
            <HeaderTable headers={headers} />
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  entry: RequestLogEntry | null;
  onClose: () => void;
  onMock: (initial: Partial<MockRule>) => void;
  onAddToRequests: (req: Omit<SavedRequest, "id" | "createdAt" | "workspaceId">) => void;
}

export default function CapturePreviewModal({ entry, onClose, onMock, onAddToRequests }: Props) {
  if (!entry) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleMock = () => {
    const resCt = (entry.resHeaders["content-type"] ?? entry.resHeaders["Content-Type"] ?? "").toLowerCase();
    const isBinaryRes = isBinaryContentType(resCt);

    let responseBody: string;
    let responseBodyEncoding: "utf8" | "base64" | undefined;
    if (isBinaryRes) {
      responseBody = entry.resBody;
      responseBodyEncoding = "base64";
    } else {
      responseBody = (() => {
        if (!entry.resBody) return "{}";
        try {
          const bytes = Uint8Array.from(atob(entry.resBody), (c) => c.charCodeAt(0));
          return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        } catch { return "{}"; }
      })();
      responseBodyEncoding = undefined;
    }

    onMock({
      name: "",
      method: entry.method,
      urlPattern: entry.url,
      useRegex: false,
      capturedHeaders: entry.reqHeaders,
      capturedBody: entry.reqBody,
      responseStatus: entry.resStatus ?? 200,
      responseHeaders: entry.resHeaders,
      responseBody,
      responseBodyEncoding,
    });
    onClose();
  };

  const handleAddToRequests = () => {
    const SKIP = new Set(["host", "proxy-connection", "connection", "content-length", "transfer-encoding"]);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(entry.reqHeaders)) {
      if (!SKIP.has(k.toLowerCase())) headers[k] = v;
    }
    let body = "";
    if (entry.reqBody) {
      try {
        const bytes = Uint8Array.from(atob(entry.reqBody), (c) => c.charCodeAt(0));
        body = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      } catch { body = ""; }
    }
    onAddToRequests({ name: "", method: entry.method, url: entry.url, headers, body });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        className="bg-bg1 border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(900px, 92vw)", height: "min(680px, 88vh)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <span className="font-mono text-xs font-semibold text-accent">{entry.method}</span>
          <span className="font-mono text-xs text-text-dim truncate flex-1">{entry.url}</span>
          {entry.status !== null && (
            <span className={`font-mono text-xs font-bold ${statusColor(entry.status)}`}>{entry.status}</span>
          )}
          {entry.durationMs !== null && (
            <span className="font-mono text-[10px] text-text-dim">
              {entry.durationMs < 1000 ? `${entry.durationMs}ms` : `${(entry.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-bg3 text-text-dim hover:text-text-base transition-colors cursor-pointer flex-shrink-0"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Split panes */}
        <div className="flex flex-1 min-h-0 overflow-hidden divide-x divide-border">
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <Pane title="Request" headers={entry.reqHeaders} body={entry.reqBody} />
          </div>
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <Pane title="Response" headers={entry.resHeaders} body={entry.resBody} />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={handleMock}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-yellow text-xs font-medium transition-all cursor-pointer"
          >
            <Zap size={12} /> Mock
          </button>
          <button
            onClick={handleAddToRequests}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-accent text-xs font-medium transition-all cursor-pointer"
          >
            <ArrowUpRight size={12} /> Add to Requests
          </button>
        </div>
      </div>
    </div>
  );
}
