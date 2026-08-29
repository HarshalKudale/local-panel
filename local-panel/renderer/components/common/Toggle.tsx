import * as React from "react";
import * as Switch from "@radix-ui/react-switch";
import { cn } from "@/components/ui/cn";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export default function Toggle({ checked, onChange, disabled, ariaLabel }: Props) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex h-6 w-11 min-w-[2.75rem] shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-bg1",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "data-[state=checked]:border-green data-[state=checked]:bg-green/20",
        "data-[state=unchecked]:border-border data-[state=unchecked]:bg-bg3",
        !disabled && "cursor-pointer",
      )}
    >
      <Switch.Thumb
        className={cn(
          "pointer-events-none block h-[18px] w-[18px] rounded-full shadow-sm transition-transform duration-150 ease-out will-change-transform",
          "translate-x-[3px] data-[state=checked]:translate-x-[23px]",
        )}
        style={{ background: checked ? "var(--c-green)" : "var(--c-text-dim)" }}
      />
    </Switch.Root>
  );
}
