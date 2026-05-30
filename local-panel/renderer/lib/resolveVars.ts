import { Environment } from "@/types";
import { resolveRandomizers } from "@/lib/randomizer";

/** Replace {{KEY}} with env vars, then {{random.*}}. */
export function resolveVars(text: string, env: Environment | null): string {
  if (!text) return text;
  let result = text;
  // Resolve env vars: {{KEY}}
  if (env) {
    result = result.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      // Skip random.* tokens — handled separately below
      if (key.startsWith("random.")) return _match;
      const v = env.variables.find((v) => v.key === key);
      return v !== undefined ? v.value : _match;
    });
  }
  // Then resolve randomizers
  return resolveRandomizers(result);
}

/** Resolve all values in a headers record (env vars + randomizers). */
export function resolveHeaders(
  headers: Record<string, string>,
  env: Environment | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k] = resolveVars(v, env);
  return out;
}
