/**
 * Script execution sandbox for pre/post request scripts.
 * Scripts run in the main process via vm.createContext (sandboxed — no fs/net/require).
 *
 * Pre-script context:
 *   lp.request.url, lp.request.headers, lp.request.body  (mutable — changes apply to this send only)
 *   lp.environment.get/set/unset
 *   lp.sendRequest(requestId)  → Promise<ScriptResponse> (not available via IPC path)
 *
 * Post-script context:
 *   lp.response.status, lp.response.headers, lp.response.body (read-only)
 *   lp.environment.get/set/unset
 *   lp.sendRequest(requestId)  → Promise<ScriptResponse> (not available via IPC path)
 */

import { Environment, SavedRequest } from "@/types";
import { b64ToText, textToB64 } from "@/lib/utils";
import { resolveVars, resolveHeaders } from "@/lib/resolveVars";

export interface ScriptRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string; // plain text
}

export interface ScriptResponse {
  status: number;
  headers: Record<string, string>;
  body: string; // plain text
}

export interface ScriptEnvProxy {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  unset(key: string): void;
}

/** Callback signature used by pm.sendRequest — runs a request without its scripts */
export type SendRequestFn = (requestId: string) => Promise<ScriptResponse>;

export interface RunPreScriptResult {
  /** Possibly-mutated request to use for the actual send (ephemeral — not saved) */
  req: ScriptRequest;
  /** Updated environment variables (to be used for the rest of this send cycle) */
  envVars: Record<string, string>;
  error?: string;
}

export interface RunPostScriptResult {
  envVars: Record<string, string>;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function envToMap(env: Environment | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!env) return map;
  for (const v of env.variables) map[v.key] = v.value;
  return map;
}

// Scripts run via IPC in the main-process vm sandbox (scriptExecutor.ts)

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the pre-script for a request via the main-process vm sandbox.
 * Returns a (possibly mutated) copy of the request — the original is never touched.
 */
export async function runPreScript(
  script: string,
  req: ScriptRequest,
  env: Environment | null,
  _sendRequest: SendRequestFn,
): Promise<RunPreScriptResult> {
  const vars = envToMap(env);
  const fallback = { ...req, headers: { ...req.headers } };
  try {
    const result = await window.api.executeScript({
      script,
      context: "pre",
      request: req,
      envVars: vars,
    });
    if (result.error) {
      return { req: result.request ?? fallback, envVars: result.envVars ?? vars, error: result.error };
    }
    return { req: result.request ?? fallback, envVars: result.envVars ?? vars };
  } catch (e) {
    return { req: fallback, envVars: vars, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Run the post-script for a request via the main-process vm sandbox.
 * The response is read-only; only environment variables may be mutated.
 */
export async function runPostScript(
  script: string,
  response: ScriptResponse,
  env: Environment | null,
  _sendRequest: SendRequestFn,
): Promise<RunPostScriptResult> {
  const vars = envToMap(env);
  try {
    const result = await window.api.executeScript({
      script,
      context: "post",
      response,
      envVars: vars,
    });
    if (result.error) {
      return { envVars: result.envVars ?? vars, error: result.error };
    }
    return { envVars: result.envVars ?? vars };
  } catch (e) {
    return { envVars: vars, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Build the `sendRequest` callback used inside scripts.
 * Looks up the request by id, resolves variables, calls the real IPC replay,
 * and returns a plain ScriptResponse — the called request's own scripts do NOT run.
 */
export function makeSendRequest(
  requests: SavedRequest[],
  envVars: Record<string, string>,
): SendRequestFn {
  // Build a transient env-like object from the mutable vars map
  const fakeEnv: Environment = {
    id: "_script",
    name: "_script",
    createdAt: 0,
    variables: Object.entries(envVars).map(([key, value]) => ({ id: key, key, value })),
    workspaceId: "",
  };

  return async (requestId: string): Promise<ScriptResponse> => {
    const req = requests.find((r) => r.id === requestId);
    if (!req) throw new Error(`sendRequest: no request with id "${requestId}"`);

    const url     = resolveVars(req.url, fakeEnv);
    const headers = resolveHeaders(req.headers, fakeEnv);
    const body    = resolveVars(req.body, fakeEnv);

    const result = await window.api.replayRequest(req.method, url, headers, textToB64(body));
    return {
      status: result.status,
      headers: result.headers,
      body: b64ToText(result.body),
    };
  };
}
