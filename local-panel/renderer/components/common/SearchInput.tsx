import React from "react";
import { Search } from "@/lib/icons";
import { strings } from "@/lib/strings";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function SearchInput({ value, onChange, placeholder = strings.sidebar.searchPlaceholderDefault }: Props) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none select-none flex items-center"><Search size={12} /></span>
      <input
        className="bg-bg2 border border-border focus:border-accent rounded text-xs text-text-bright pl-7 pr-3 py-1.5 outline-none transition-colors w-44"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
