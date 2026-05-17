import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { RequestLogEntry, MockRule, SavedRequest } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import PanelHeader from "@/components/layout/PanelHeader";
import CapturePreviewModal from "@/components/capture/CapturePreviewModal";
import ViaBadge, { VIA_LABEL } from "@/components/common/ViaBadge";
import { strings } from "@/lib/strings";
import { Play, Pause, ArrowUpRight, Zap, Clipboard } from "@/lib/icons";
import { Button } from "@/components/ui";
import { isBinaryContentType } from "@/lib/bodyUtils";

export interface CaptureStats {
  total: number;
  shown: number;
  paused: boolean;
}

const MAX_ENTRIES = 200;
const storageKey = (wsId: string) => `capture:entries:${wsId}`;

function statusColor(s: number | null): string {
  if (s === null) return "text-text-dim";
  if (s < 300) return "text-green";
  if (s < 400) return "text-yellow";
  return "text-red";
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function fmtDur(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function loadPersistedEntries(wsId: string): RequestLogEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(wsId));
    if (!raw) return [];
    return JSON.parse(raw) as RequestLogEntry[];
  } catch {
    return [];
  }
}

function persistEntries(wsId: string, entries: RequestLogEntry[]) {
  try {
    localStorage.setItem(storageKey(wsId), JSON.stringify(entries));
  } catch { /* quota */ }
}

interface Props {
  activeWorkspaceId: string;
  onOpenInMocks: (initial: Partial<MockRule>) => void;
  onOpenInRequests: (req: Omit<SavedRequest, "id" | "createdAt" | "workspaceId">) => void;
  onStatsChange?: (stats: CaptureStats) => void;
}

export default function CapturePanel({ activeWorkspaceId, onOpenInMocks, onOpenInRequests, onStatsChange }: Props) {
  const [entries, setEntries] = useState<RequestLogEntry[]>(() => loadPersistedEntries(activeWorkspaceId));
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(true);
  const pausedRef = useRef(true);
  pausedRef.current = paused;
  const [previewEntry, setPreviewEntry] = useState<RequestLogEntry | null>(null);

  useEffect(() => {
    setEntries(loadPersistedEntries(activeWorkspaceId));
  }, [activeWorkspaceId]);

  useEffect(() => {
    persistEntries(activeWorkspaceId, entries);
  }, [activeWorkspaceId, entries]);

  useEffect(() => {
    const unsub = window.api.onLogEntry((entry) => {
      if (pausedRef.current) return;
      setEntries((prev) => {
        const next = [entry, ...prev];
        return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
      });
    });
    return unsub;
  }, []);

  // Streaming chunk accumulation
  useEffect(() => {
    const unsub = window.api.onLogChunk((chunk) => {
      if (pausedRef.current) return;
      if (chunk.done) return; // Final log:entry will have the full body
      setEntries((prev) => prev.map((e) => {
        if (e.id !== chunk.logId) return e;
        // Accumulate base64 chunks into resBody for live display
        return { ...e, resBody: e.resBody + chunk.chunk };
      }));
    });
    return unsub;
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    localStorage.removeItem(storageKey(activeWorkspaceId));
  }, [activeWorkspaceId]);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const buildMockInitial = (e: RequestLogEntry): Partial<MockRule> => {
    const resCt = (e.resHeaders["content-type"] ?? e.resHeaders["Content-Type"] ?? "").toLowerCase();
    const isBinaryRes = isBinaryContentType(resCt);
    return {
      name: "",
      method: e.method,
      urlPattern: e.url,
      useRegex: false,
      capturedHeaders: e.reqHeaders,
      capturedBody: e.reqBody,
      responseStatus: e.resStatus ?? 200,
      responseHeaders: e.resHeaders,
      responseBody: isBinaryRes
        ? e.resBody
        : (() => {
            if (!e.resBody) return "{}";
            try {
              const bytes = Uint8Array.from(atob(e.resBody), (c) => c.charCodeAt(0));
              return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
            } catch { return "{}"; }
          })(),
      responseBodyEncoding: isBinaryRes ? "base64" : undefined,
    };
  };

  const handleOpenClick = useCallback((entry: RequestLogEntry) => {
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
    onOpenInRequests({ name: "", method: entry.method, url: entry.url, headers, body });
  }, [onOpenInRequests]);

  const handleMockClick = useCallback((entry: RequestLogEntry) => {
    onOpenInMocks(buildMockInitial(entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOpenInMocks]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? entries.filter(
            (e) =>
              e.url.toLowerCase().includes(q) ||
              e.method.toLowerCase().includes(q) ||
              e.host.toLowerCase().includes(q) ||
              (e.target ?? "").toLowerCase().includes(q) ||
              String(e.status ?? "").includes(q) ||
              VIA_LABEL[e.via].toLowerCase().includes(q),
          )
        : entries,
    [entries, q],
  );

  // Notify parent of current stats so the global footer can display them
  useEffect(() => {
    onStatsChange?.({ total: entries.length, shown: filtered.length, paused });
  }, [entries.length, filtered.length, paused, onStatsChange]);


  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PanelHeader
        title="Capture"
        subtitle="Captured requests — persisted across sessions · last 200 kept"
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="URL, method, host…" />
            <button
              onClick={() => setPaused((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${paused
                  ? "border-yellow bg-yellow/10 text-yellow"
                  : "border-green/40 bg-green/10 text-green hover:bg-green/20"
                }`}
            >
              {paused ? <><Play size={10} fill="currentColor" /> Start</> : <><Pause size={10} fill="currentColor" /> Pause</>}
            </button>
            <Button variant="secondary" onClick={clear}>Clear</Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="opacity-15 mb-3"><Clipboard size={36} /></div>
            <div className="text-sm font-medium text-text-base font-sans mb-1">No captured requests</div>
            <p className="text-xs text-text-dim font-sans">
              {entries.length === 0
                ? paused
                  ? "Click Start to begin capturing HTTP traffic."
                  : "HTTP traffic will appear here as requests pass through the app."
                : "No entries match your search."}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-bg0 z-10">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim">Time</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim whitespace-nowrap">URL</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim w-12">Mth</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim w-10">St</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim w-16">Via</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim w-14">Dur</th>
                <th className="px-3 py-2 w-36" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-border/30 hover:bg-bg1 transition-colors group cursor-pointer"
                  title="Click to preview request details"
                  onClick={() => setPreviewEntry(e)}
                >
                  <td className="px-3 py-1.5 text-text-base">
                    <span className="block">{fmtTime(e.ts)}</span>
                  </td>
                  <td className="px-3 py-1.5 text-text-dim whitespace-nowrap">{e.url}</td>
                  <td className="px-3 py-1.5 text-accent whitespace-nowrap">{e.method}</td>
                  <td className={`px-3 py-1.5 whitespace-nowrap font-semibold ${statusColor(e.status)}`}>
                    {e.status ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <ViaBadge via={e.via} />
                  </td>
                  <td className="px-3 py-1.5 text-right text-text-dim whitespace-nowrap">
                    {fmtDur(e.durationMs)}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <div className="flex gap-1 justify-end" onClick={(ev) => ev.stopPropagation()}>
                      <button
                        onClick={() => handleOpenClick(e)}
                        className="px-2 py-0.5 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-accent text-[10px] font-medium transition-all cursor-pointer"
                        title="Open in Requests panel"
                      >
                        <ArrowUpRight size={10} className="inline mr-0.5" /> Open
                      </button>
                      <button
                        onClick={() => handleMockClick(e)}
                        className="px-2 py-0.5 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-yellow text-[10px] font-medium transition-all cursor-pointer"
                        title="Create mock from this request"
                      >
                        <Zap size={10} className="inline mr-0.5" /> Mock
                      </button>
                      <button
                        onClick={() => removeEntry(e.id)}
                        className="px-2 py-0.5 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-red text-[10px] font-medium transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                        title="Remove this entry"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CapturePreviewModal
        entry={previewEntry}
        onClose={() => setPreviewEntry(null)}
        onMock={onOpenInMocks}
        onAddToRequests={onOpenInRequests}
      />
    </div>
  );
}
