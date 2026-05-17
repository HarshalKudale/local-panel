import React from "react";
import { cn } from "@/components/ui/cn";

export type BadgeVariant = "accent" | "green" | "red" | "yellow" | "neutral";

interface BadgeProps {
  variant: BadgeVariant;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  accent:  "bg-accent/10 text-accent",
  green:   "bg-green/10 text-green",
  red:     "bg-red/10 text-red",
  yellow:  "bg-yellow/10 text-yellow",
  neutral: "bg-bg3 text-text-dim",
};

export default function Badge({ variant, dot, className, children }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
      variantClasses[variant],
      className
    )}>
      {dot && "●"}
      {children}
    </span>
  );
}
