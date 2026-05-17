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
          "bg-bg2 border rounded outline-none transition-colors",
          inputSize === "sm" ? "text-xs px-2.5 py-1" : "text-sm px-3 py-2",
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
