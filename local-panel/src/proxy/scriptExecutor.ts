/**
 * Sandboxed script execution using Node's built-in vm module.
 * Used for proxy rule request/response intercept scripts (synchronous)
 * and for request pre/post scripts via the script:execute IPC handler.
 *
 * Scripts receive an `lp` context object and run inside a vm.Script with a timeout.
 * They cannot access Node builtins (require, process, etc.) unless explicitly provided.
 */

import * as vm from "vm";

const SCRIPT_TIMEOUT_MS = 5000;

export interface ProxyScriptContext {
  headers: Record<string, string>;
  body: string;
}

export interface ProxyScriptResult {
  headers: Record<string, string>;
  body: string;
  error?: string;
}

function runProxyScript(
  script: string,
  lpKey: "request" | "response",
  ctx: ProxyScriptContext,
): ProxyScriptResult {
  const mutableHeaders = { ...ctx.headers };
  let mutableBody = ctx.body;

  const lpObj = {
    [lpKey]: {
      get headers() { return mutableHeaders; },
      get body() { return mutableBody; },
      set body(v: string) { mutableBody = v; },
    },
  };

  const sandbox = vm.createContext({ lp: lpObj });
  try {
    new vm.Script(script).runInContext(sandbox, { timeout: SCRIPT_TIMEOUT_MS });
    return { headers: mutableHeaders, body: mutableBody };
  } catch (e) {
    return { headers: mutableHeaders, body: mutableBody, error: e instanceof Error ? e.message : String(e) };
  }
}

export function executeRequestScript(
  script: string,
  headers: Record<string, string>,
  body: string,
): ProxyScriptResult {
  return runProxyScript(script, "request", { headers, body });
}

export function executeResponseScript(
  script: string,
  headers: Record<string, string>,
  body: string,
): ProxyScriptResult {
  return runProxyScript(script, "response", { headers, body });
}

// ── IPC script executor (async, for request pre/post scripts) ─────────────────

export interface IpcScriptOpts {
  script: string;
  context: "pre" | "post";
  request?: { method: string; url: string; headers: Record<string, string>; body: string };
  response?: { status: number; headers: Record<string, string>; body: string };
  envVars: Record<string, string>;
}

export interface IpcScriptResult {
  request?: { method: string; url: string; headers: Record<string, string>; body: string };
  response?: { status: number; headers: Record<string, string>; body: string };
  envVars: Record<string, string>;
  error?: string;
}

export function executeIpcScript(opts: IpcScriptOpts): IpcScriptResult {
  const vars = { ...opts.envVars };

  const envProxy = {
    get: (key: string) => vars[key],
    set: (key: string, value: string) => { vars[key] = String(value); },
    unset: (key: string) => { delete vars[key]; },
  };

  let lpObj: Record<string, unknown>;

  if (opts.context === "pre" && opts.request) {
    const req = { ...opts.request, headers: { ...opts.request.headers } };
    lpObj = {
      request: {
        get url() { return req.url; },
        set url(v: string) { req.url = v; },
        get method() { return req.method; },
        set method(v: string) { req.method = v; },
        get body() { return req.body; },
        set body(v: string) { req.body = v; },
        headers: {
          get: (key: string) => req.headers[key],
          set: (key: string, value: string) => { req.headers[key] = value; },
          unset: (key: string) => { delete req.headers[key]; },
          toObject: () => ({ ...req.headers }),
        },
      },
      environment: envProxy,
    };

    const sandbox = vm.createContext({ lp: lpObj });
    try {
      new vm.Script(opts.script).runInContext(sandbox, { timeout: SCRIPT_TIMEOUT_MS });
      return { request: req, envVars: vars };
    } catch (e) {
      return { request: req, envVars: vars, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (opts.context === "post" && opts.response) {
    const res = { ...opts.response, headers: { ...opts.response.headers } };
    lpObj = {
      response: {
        get status() { return res.status; },
        get body() { return res.body; },
        headers: {
          get: (key: string) => res.headers[key],
          toObject: () => ({ ...res.headers }),
        },
        json: () => {
          try { return JSON.parse(res.body); } catch { return null; }
        },
      },
      environment: envProxy,
    };

    const sandbox = vm.createContext({ lp: lpObj });
    try {
      new vm.Script(opts.script).runInContext(sandbox, { timeout: SCRIPT_TIMEOUT_MS });
      return { response: res, envVars: vars };
    } catch (e) {
      return { response: res, envVars: vars, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { envVars: vars, error: "Invalid script context or missing request/response" };
}
