import React from "react";

interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

export default function FormField({ label, error, children }: FormFieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-text-dim mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-red mt-1">{error}</p>}
    </div>
  );
}
