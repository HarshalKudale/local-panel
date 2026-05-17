import React from "react";
import { cn } from "@/components/ui/cn";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  inputSize?: "sm" | "md";
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, inputSize = "md", className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "bg-bg2 border rounded outline-none transition-colors cursor-pointer appearance-none",
          inputSize === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-2",
          "text-text-base",
          error ? "border-red" : "border-border focus:border-accent",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

export default Select;
