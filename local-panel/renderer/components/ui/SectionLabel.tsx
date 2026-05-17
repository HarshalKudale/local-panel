import React from "react";

interface SectionLabelProps {
  children: React.ReactNode;
}

export default function SectionLabel({ children }: SectionLabelProps) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-text-dim mb-2 px-1">
      {children}
    </div>
  );
}
