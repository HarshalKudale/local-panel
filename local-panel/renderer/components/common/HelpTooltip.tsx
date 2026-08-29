import React, { useId, useState } from "react";

interface Props {
  text: string;
}

export default function HelpTooltip({ text }: Props) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative ml-auto flex-shrink-0 group">
      <button
        type="button"
        aria-label="Show panel help"
        aria-describedby={tooltipId}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-7 h-7 rounded-full border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-text-base text-xs font-bold flex items-center justify-center transition-colors cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-bg1"
      >
        ?
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className={`absolute top-full right-0 mt-1.5 z-50 w-72 p-3 rounded-lg border border-border bg-bg2 shadow-2xl text-xs text-text-dim leading-relaxed pointer-events-none transition-opacity ${
          open ? "opacity-100" : "opacity-0 invisible"
        }`}
      >
        {text}
        <div className="absolute -top-1.5 right-2 w-2.5 h-2.5 bg-bg2 border-l border-t border-border rotate-45" />
      </div>
    </div>
  );
}
