import React, { useState } from "react";
import { strings } from "@/lib/strings";
import { Play, Square } from "@/lib/icons";

interface Props {
  running: boolean;
  error: string | null;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
}

export default function ServerToggle({ running, error, onStart, onStop }: Props) {
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try { running ? await onStop() : await onStart(); }
    finally { setBusy(false); }
  };

  const hasError = !!error;

  return (
    <button
      onClick={handle}
      disabled={busy}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      title={running ? strings.titleBar.stopServer : strings.titleBar.startServer}
      className={`flex items-center justify-center w-7 h-7 rounded border transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${
        running
          ? "border-green/40 bg-green/10 hover:bg-red/15 hover:border-red/40 text-green hover:text-red"
          : hasError
          ? "border-red/40 bg-red/10 hover:bg-green/15 hover:border-green/40 text-red hover:text-green"
          : "border-border bg-bg2 hover:bg-green/15 hover:border-green/40 text-text-dim hover:text-green"
      }`}
    >
      {busy ? (
        <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      ) : running ? (
        <Square size={10} fill="currentColor" />
      ) : (
        <Play size={10} fill="currentColor" />
      )}
    </button>
  );
}
