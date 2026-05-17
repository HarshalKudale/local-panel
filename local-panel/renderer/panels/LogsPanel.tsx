import React, { useEffect, useRef, useState, useCallback } from "react";
import { RequestLogEntry, MockRule, ReplayResult } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import RestTab from "@/components/rest/RestTab";
import ReplayResultModal from "@/components/capture/ReplayResultModal";
import ViaBadge, { VIA_LABEL } from "@/components/common/ViaBadge";
import { Play, Pause, Zap, Clipboard } from "@/lib/icons";
import { Button } from "@/components/ui";

const MAX_ENTRIES = 100;

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

interface Props {
  onMockAdded: (mock: MockRule) => void;
}

export default function LogsPanel({ onMockAdded }: Props) {
  const [entries, setEntries] = useState<RequestLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const [replayEntry, setReplayEntry] = useState<RequestLogEntry | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  const [mockEntry, setMockEntry] = useState<RequestLogEntry | null>(null);

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

  const clear = useCallback(() => setEntries([]), []);

  const handleReplay = useCallback(async (entry: RequestLogEntry) => {
    setReplayEntry(entry);
    setReplayResult(null);
    setReplayError(null);
    setReplayLoading(true);
    try {
      const result = await window.api.replayRequest(entry.method, entry.url, entry.reqHeaders, entry.reqBody);
      setReplayResult(result);
    } catch (e: unknown) {
      setReplayError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setReplayLoading(false);
    }
  }, []);

  const handleMockSave = useCallback(async (data: Omit<MockRule, "id" | "createdAt" | "workspaceId">) => {
    const mock = await window.api.addMock(data);
    onMockAdded(mock);
    setMockEntry(null);
  }, [onMockAdded]);

  const buildMockInitial = (e: RequestLogEntry): Partial<MockRule> => ({
    name: "",
    method: e.method,
    urlPattern: e.url,
    useRegex: false,
    capturedHeaders: e.reqHeaders,
    capturedBody: e.reqBody,
    responseStatus: e.resStatus ?? 200,
    responseHeaders: e.resHeaders,
    responseBody: (() => {
      if (!e.resBody) return "{}";
      try {
        const bytes = Uint8Array.from(atob(e.resBody), (c) => c.charCodeAt(0));
        return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      } catch { return "{}"; }
    })(),
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? entries.filter((e) =>
        e.url.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        e.host.toLowerCase().includes(q) ||
        (e.target ?? "").toLowerCase().includes(q) ||
        String(e.status ?? "").includes(q) ||
        VIA_LABEL[e.via].toLowerCase().includes(q)
      )
    : entries;

  if (mockEntry) {
    return (
      <RestTab
        tabType="mock"
        tabId={`logs-mock-${mockEntry.id}`}
        initial={buildMockInitial(mockEntry)}
        onSave={handleMockSave}
        onClose={() => setMockEntry(null)}
        showCurlImport={false}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3 flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-text-bright">Logs</h1>
          <p className="text-xs text-text-dim mt-0.5">HTTP traffic through the app — via proxy or RFC 6761</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="URL, method, host…" />
          <button
            onClick={() => setPaused((v) => !v)}
            className={`px-3 py-1.5 rounded border text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              paused
                ? "border-yellow bg-yellow/10 text-yellow"
                : "border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-text-base"
            }`}
          >
            {paused ? <><Play size={10} fill="currentColor" className="inline mr-1" /> Resume</> : <><Pause size={10} fill="currentColor" className="inline mr-1" /> Pause</>}
          </button>
          <Button variant="secondary" onClick={clear}>Clear</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="opacity-15 mb-3"><Clipboard size={36} /></div>
            <div className="text-sm font-medium text-text-base font-sans mb-1">No log entries</div>
            <p className="text-xs text-text-dim font-sans">
              {entries.length === 0
                ? "HTTP traffic will appear here as requests pass through the app."
                : "No entries match your search."}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-bg0 z-10">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim whitespace-nowrap">Time</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim w-12">Mth</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim w-10">St</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim">URL</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim w-16">Via</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim w-14">Dur</th>
                <th className="px-3 py-2 w-28" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-border/30 hover:bg-bg1 transition-colors group"
                  title={e.url}
                >
                  <td className="px-3 py-1.5 text-text-dim whitespace-nowrap">{fmtTime(e.ts)}</td>
                  <td className="px-3 py-1.5 text-accent whitespace-nowrap">{e.method}</td>
                  <td className={`px-3 py-1.5 whitespace-nowrap font-semibold ${statusColor(e.status)}`}>
                    {e.status ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-text-base max-w-0">
                    <span className="block truncate">{e.url}</span>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <ViaBadge via={e.via} />
                  </td>
                  <td className="px-3 py-1.5 text-right text-text-dim whitespace-nowrap">
                    {fmtDur(e.durationMs)}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => handleReplay(e)}
                        className="px-2 py-0.5 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-accent text-[10px] font-medium transition-all cursor-pointer"
                        title="Replay this request"
                      >
                        <Play size={10} fill="currentColor" className="inline mr-0.5" /> Replay
                      </button>
                      <button
                        onClick={() => setMockEntry(e)}
                        className="px-2 py-0.5 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-yellow text-[10px] font-medium transition-all cursor-pointer"
                        title="Create mock from this request"
                      >
                        <Zap size={10} className="inline mr-0.5" /> Mock
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-4 py-1.5 border-t border-border flex items-center gap-3 text-[10px] text-text-dim font-mono flex-shrink-0">
        <span>{entries.length} entries</span>
        {q && <span>· {filtered.length} shown</span>}
        {paused && <span className="text-yellow">· paused</span>}
        <span className="ml-auto">newest first · last {MAX_ENTRIES} kept · auto-cleared when full</span>
      </div>

      <ReplayResultModal
        open={!!replayEntry}
        url={replayEntry?.url ?? ""}
        result={replayResult}
        error={replayError}
        loading={replayLoading}
        onClose={() => { setReplayEntry(null); setReplayResult(null); setReplayError(null); }}
      />
    </div>
  );
}
