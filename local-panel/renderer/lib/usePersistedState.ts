import { useState, useEffect, useRef } from "react";
import { readStorage, writeStorage } from "@/lib/storage";

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  validate?: (v: T) => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    return readStorage(key, defaultValue, validate);
  });

  // Skip first render write so we don't overwrite a freshly read value
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    writeStorage(key, state);
  }, [key, state]);

  return [state, setState];
}
