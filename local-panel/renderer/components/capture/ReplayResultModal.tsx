import React, { useState } from "react";
import Modal from "@/components/common/Modal";
import { ReplayResult } from "@/types";
import CodeEditor, { EditorLanguage } from "@/components/common/CodeEditor";
import { b64ToText, tryFormat } from "@/lib/utils";

function ctToLang(ct: string): EditorLanguage {
  const c = ct.toLowerCase();
  if (c.includes("json"))                          return "json";
  if (c.includes("html"))                          return "html";
  if (c.includes("xml"))                           return "xml";
  if (c.includes("javascript") || c.includes("ecmascript")) return "javascript";
  return "text";
}

interface Props {
  open: boolean;
  url: string;
  result: ReplayResult | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
}

function statusColor(s: number): string {
  if (s < 300) return "text-green";
  if (s < 400) return "text-yellow";
  return "text-red";
}

export default function ReplayResultModal({ open, url, result, error, loading, onClose }: Props) {
  const [tab, setTab] = useState<"headers" | "body">("body");

  const lang: EditorLanguage = result ? ctToLang(result.headers["content-type"] ?? "") : "json";
  const bodyText = result
    ? (lang === "json" ? tryFormat(b64ToText(result.body)) : b64ToText(result.body))
    : "";

  return (
    <Modal open={open} title="Replay Result" onClose={onClose}>
      <div className="flex flex-col gap-3 min-w-0" style={{ minWidth: 520 }}>
        <div className="font-mono text-[11px] text-text-dim break-all bg-bg2 px-3 py-2 rounded border border-border">
          {url}
        </div>

        {loading && (
          <div className="text-xs text-text-dim text-center py-6">Sending request…</div>
        )}

        {error && !loading && (
          <div className="px-3 py-2 rounded border border-red/30 bg-red/5 text-xs text-red">{error}</div>
        )}

        {result && !loading && (
          <>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold font-mono ${statusColor(result.status)}`}>{result.status}</span>
              <span className="text-xs text-text-dim">{Object.keys(result.headers).length} response headers</span>
            </div>

            <div className="flex border-b border-border">
              {(["body", "headers"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 text-xs font-medium capitalize cursor-pointer transition-colors ${
                    tab === t ? "border-b-2 border-accent text-accent -mb-px" : "text-text-dim hover:text-text-base"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "body" && (
              bodyText
                ? <div className="border border-border rounded overflow-hidden" style={{ maxHeight: 256 }}>
                    <CodeEditor value={bodyText} readOnly language={lang} className="h-full" />
                  </div>
                : <p className="font-mono text-[11px] text-text-dim italic bg-bg2 border border-border rounded p-3">empty body</p>
            )}

            {tab === "headers" && (
              <div className="bg-bg2 border border-border rounded overflow-auto max-h-64">
                {Object.entries(result.headers).length === 0 ? (
                  <p className="text-xs text-text-dim p-3 italic">No headers</p>
                ) : (
                  <table className="w-full border-collapse">
                    <tbody>
                      {Object.entries(result.headers).map(([k, v]) => (
                        <tr key={k} className="border-b border-border/40 last:border-0">
                          <td className="px-3 py-1.5 text-[11px] font-mono text-text-dim whitespace-nowrap align-top w-40">{k}</td>
                          <td className="px-3 py-1.5 text-[11px] font-mono text-text-bright break-all">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end pt-2 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-border bg-bg2 hover:bg-bg3 text-text-dim text-xs font-medium transition-all cursor-pointer">Close</button>
        </div>
      </div>
    </Modal>
  );
}
