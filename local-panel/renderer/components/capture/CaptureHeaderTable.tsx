import React from "react";
import { strings } from "@/lib/strings";

export default function CaptureHeaderTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return <p className="text-xs text-text-dim italic px-3 py-2">{strings.capture.noHeaders}</p>;
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
