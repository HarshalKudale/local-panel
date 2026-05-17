import React from "react";
import { RequestLogEntry } from "@/types";

type Via = RequestLogEntry["via"];

export const VIA_LABEL: Record<Via, string> = {
  rfc6761: "RFC 6761",
  proxy: "Proxy",
  rule: "Rule",
  mock: "Mock",
  error: "Error",
};

const VIA_COLOR: Record<Via, string> = {
  rfc6761: "text-green",
  proxy: "text-accent",
  rule: "text-yellow",
  mock: "text-purple-400",
  error: "text-red",
};

export default function ViaBadge({ via }: { via: Via }) {
  if (via === "mock") return <span style={{ color: "var(--c-method-head)" }}>{VIA_LABEL.mock}</span>;
  return <span className={VIA_COLOR[via]}>{VIA_LABEL[via]}</span>;
}
