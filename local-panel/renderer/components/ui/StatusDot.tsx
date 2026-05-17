import React from "react";
import { cn } from "@/components/ui/cn";

export type DotColor = "green" | "red" | "yellow" | "accent" | "dim";

interface StatusDotProps {
  color: DotColor;
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const colorStyles: Record<DotColor, string> = {
  green:  "var(--c-green)",
  red:    "var(--c-red)",
  yellow: "var(--c-yellow)",
  accent: "var(--c-accent)",
  dim:    "var(--c-text-dim)",
};

export default function StatusDot({ color, pulse, size = "sm", className }: StatusDotProps) {
  const px = size === "sm" ? 7 : 10;
  return (
    <span
      className={cn("inline-block flex-shrink-0", pulse && "animate-pulse", className)}
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        background: colorStyles[color],
      }}
    />
  );
}
