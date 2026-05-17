import { useState, useEffect, useRef } from "react";

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  validate?: (v: T) => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      const parsed = JSON.parse(raw) as T;
      return validate ? validate(parsed) : parsed;
    } catch {
      return defaultValue;
    }
  });

  // Skip first render write so we don't overwrite a freshly read value
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* quota */ }
  }, [key, state]);

  return [state, setState];
}
