import React from "react";

interface Props {
  text: string;
}

export default function HelpTooltip({ text }: Props) {
  return (
    <div className="relative ml-auto flex-shrink-0 group">
      <button
        className="w-5 h-5 rounded-full border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-text-base text-[10px] font-bold flex items-center justify-center transition-colors cursor-default"
        tabIndex={-1}
      >
        ?
      </button>
      <div className="absolute top-full right-0 mt-1.5 z-50 hidden group-hover:block w-72 p-3 rounded-lg border border-border bg-bg2 shadow-2xl text-xs text-text-dim leading-relaxed pointer-events-none">
        {text}
        <div className="absolute -top-1.5 right-2 w-2.5 h-2.5 bg-bg2 border-l border-t border-border rotate-45" />
      </div>
    </div>
  );
}
