import React from "react";
import { cn } from "@/components/ui/cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  inputSize?: "sm" | "md";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, inputSize = "md", className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full bg-bg2 border rounded-md outline-none transition-colors",
          "placeholder:text-text-dim/70",
          "focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:ring-offset-2 focus-visible:ring-offset-bg1",
          inputSize === "sm" ? "min-h-8 text-sm px-2.5 py-1.5" : "min-h-10 text-sm px-3 py-2",
          "text-text-bright",
          error ? "border-red" : "border-border focus:border-accent",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export default Input;
