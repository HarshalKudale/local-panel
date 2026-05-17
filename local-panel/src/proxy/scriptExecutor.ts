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
  context: "pre" | "post" | "test";
  request?: { method: string; url: string; headers: Record<string, string>; body: string };
  response?: { status: number; headers: Record<string, string>; body: string; responseTime?: number };
  envVars: Record<string, string>;
}

export interface IpcScriptResult {
  request?: { method: string; url: string; headers: Record<string, string>; body: string };
  response?: { status: number; headers: Record<string, string>; body: string };
  envVars: Record<string, string>;
  error?: string;
  /** Present only for context: "test" */
  testResults?: TestResultEntry[];
  testLogs?: string[];
}

// ── Test script types ─────────────────────────────────────────────────────────

export interface TestResultEntry {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
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

  if (opts.context === "test" && opts.response) {
    return executeTestScript(opts.script, opts.response, vars);
  }

  return { envVars: vars, error: "Invalid script context or missing request/response" };
}

// ── Test script executor ──────────────────────────────────────────────────────

/**
 * Build a chai-like `expect(value)` assertion function.
 * Throws an Error with a descriptive message on assertion failure.
 */
function buildExpect() {
  return function expect(actual: unknown) {
    function assertionError(msg: string): Error {
      return new Error(msg);
    }

    const buildChain = (negated: boolean) => {
      const chain: Record<string, unknown> = {};

      // Chainable language helpers (no-ops for readability)
      const passthrough = () => chain;
      Object.defineProperty(chain, "to", { get: () => chain });
      Object.defineProperty(chain, "be", { get: () => chain });
      Object.defineProperty(chain, "been", { get: () => chain });
      Object.defineProperty(chain, "is", { get: () => chain });
      Object.defineProperty(chain, "that", { get: () => chain });
      Object.defineProperty(chain, "which", { get: () => chain });
      Object.defineProperty(chain, "and", { get: () => chain });
      Object.defineProperty(chain, "has", { get: () => chain });
      Object.defineProperty(chain, "have", { get: () => chain });
      Object.defineProperty(chain, "with", { get: () => chain });
      Object.defineProperty(chain, "at", { get: () => chain });
      Object.defineProperty(chain, "of", { get: () => chain });
      Object.defineProperty(chain, "same", { get: () => chain });
      Object.defineProperty(chain, "but", { get: () => chain });
      Object.defineProperty(chain, "does", { get: () => chain });
      Object.defineProperty(chain, "still", { get: () => chain });
      Object.defineProperty(chain, "also", { get: () => chain });

      // .not — flips the negation
      Object.defineProperty(chain, "not", { get: () => buildChain(!negated) });

      // .ok — truthy check
      Object.defineProperty(chain, "ok", {
        get: () => {
          const pass = !!actual;
          if (negated ? pass : !pass) {
            throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be truthy`);
          }
          return chain;
        },
      });

      // .true / .false / .null / .undefined
      Object.defineProperty(chain, "true", {
        get: () => {
          const pass = actual === true;
          if (negated ? pass : !pass) throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be true`);
          return chain;
        },
      });
      Object.defineProperty(chain, "false", {
        get: () => {
          const pass = actual === false;
          if (negated ? pass : !pass) throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be false`);
          return chain;
        },
      });
      Object.defineProperty(chain, "null", {
        get: () => {
          const pass = actual === null;
          if (negated ? pass : !pass) throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be null`);
          return chain;
        },
      });
      Object.defineProperty(chain, "undefined", {
        get: () => {
          const pass = actual === undefined;
          if (negated ? pass : !pass) throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be undefined`);
          return chain;
        },
      });

      // .equal(val)
      chain.equal = chain.equals = chain.eq = (expected: unknown) => {
        const pass = actual === expected;
        if (negated ? pass : !pass) {
          throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to equal ${JSON.stringify(expected)}`);
        }
        return chain;
      };

      // .eql(val) — deep equal
      chain.eql = chain.eqls = (expected: unknown) => {
        const pass = JSON.stringify(actual) === JSON.stringify(expected);
        if (negated ? pass : !pass) {
          throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to deeply equal ${JSON.stringify(expected)}`);
        }
        return chain;
      };

      // .a(type) / .an(type)
      chain.a = chain.an = (type: string) => {
        let pass = false;
        const t = type.toLowerCase();
        if (t === "array") pass = Array.isArray(actual);
        else if (t === "object") pass = typeof actual === "object" && actual !== null && !Array.isArray(actual);
        else if (t === "null") pass = actual === null;
        else pass = typeof actual === t;
        if (negated ? pass : !pass) {
          throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be a(n) ${type}`);
        }
        return chain;
      };

      // .include(val) / .contain(val) / .includes(val) / .contains(val)
      chain.include = chain.contain = chain.includes = chain.contains = (val: unknown) => {
        let pass = false;
        if (typeof actual === "string" && typeof val === "string") pass = actual.includes(val);
        else if (Array.isArray(actual)) pass = actual.includes(val);
        else if (typeof actual === "object" && actual !== null && typeof val === "string") pass = val in (actual as object);
        if (negated ? pass : !pass) {
          throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to include ${JSON.stringify(val)}`);
        }
        return chain;
      };

      // .property(key)
      chain.property = (key: string) => {
        const pass = typeof actual === "object" && actual !== null && key in (actual as object);
        if (negated ? pass : !pass) {
          throw assertionError(`expected object ${negated ? "not " : ""}to have property "${key}"`);
        }
        return chain;
      };

      // .length(n) / .lengthOf(n)
      chain.length = chain.lengthOf = (n: number) => {
        const len = (actual as any)?.length;
        const pass = len === n;
        if (negated ? pass : !pass) {
          throw assertionError(`expected length ${len} ${negated ? "not " : ""}to equal ${n}`);
        }
        return chain;
      };

      // .lengthAbove(n) — alias for length greater than
      chain.lengthAbove = (n: number) => {
        const len = (actual as any)?.length;
        const pass = typeof len === "number" && len > n;
        if (negated ? pass : !pass) {
          throw assertionError(`expected length ${len} ${negated ? "not " : ""}to be above ${n}`);
        }
        return chain;
      };

      // .above(n) / .greaterThan(n) / .gt(n)
      chain.above = chain.greaterThan = chain.gt = (n: number) => {
        const pass = typeof actual === "number" && actual > n;
        if (negated ? pass : !pass) {
          throw assertionError(`expected ${actual} ${negated ? "not " : ""}to be above ${n}`);
        }
        return chain;
      };

      // .below(n) / .lessThan(n) / .lt(n)
      chain.below = chain.lessThan = chain.lt = (n: number) => {
        const pass = typeof actual === "number" && actual < n;
        if (negated ? pass : !pass) {
          throw assertionError(`expected ${actual} ${negated ? "not " : ""}to be below ${n}`);
        }
        return chain;
      };

      // .least(n) / .gte(n)
      chain.least = chain.gte = (n: number) => {
        const pass = typeof actual === "number" && actual >= n;
        if (negated ? pass : !pass) {
          throw assertionError(`expected ${actual} ${negated ? "not " : ""}to be at least ${n}`);
        }
        return chain;
      };

      // .most(n) / .lte(n)
      chain.most = chain.lte = (n: number) => {
        const pass = typeof actual === "number" && actual <= n;
        if (negated ? pass : !pass) {
          throw assertionError(`expected ${actual} ${negated ? "not " : ""}to be at most ${n}`);
        }
        return chain;
      };

      // .match(regex)
      chain.match = chain.matches = (re: RegExp | string) => {
        const regex = typeof re === "string" ? new RegExp(re) : re;
        const pass = typeof actual === "string" && regex.test(actual);
        if (negated ? pass : !pass) {
          throw assertionError(`expected "${actual}" ${negated ? "not " : ""}to match ${regex}`);
        }
        return chain;
      };

      // .status(code) — shorthand for checking response status
      chain.status = (code: number) => {
        const pass = actual === code;
        if (negated ? pass : !pass) {
          throw assertionError(`expected status ${actual} ${negated ? "not " : ""}to be ${code}`);
        }
        return chain;
      };

      // .empty
      Object.defineProperty(chain, "empty", {
        get: () => {
          let pass = false;
          if (typeof actual === "string" || Array.isArray(actual)) pass = (actual as any).length === 0;
          else if (typeof actual === "object" && actual !== null) pass = Object.keys(actual).length === 0;
          if (negated ? pass : !pass) {
            throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be empty`);
          }
          return chain;
        },
      });

      // .oneOf(list)
      chain.oneOf = (list: unknown[]) => {
        const pass = list.includes(actual);
        if (negated ? pass : !pass) {
          throw assertionError(`expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be one of ${JSON.stringify(list)}`);
        }
        return chain;
      };

      return chain;
    };

    return buildChain(false);
  };
}

function executeTestScript(
  script: string,
  response: { status: number; headers: Record<string, string>; body: string; responseTime?: number },
  envVars: Record<string, string>,
): IpcScriptResult {
  const tests: TestResultEntry[] = [];
  const logs: string[] = [];

  const res = { ...response, headers: { ...response.headers } };

  const lpResponse = {
    get status() { return res.status; },
    get body() { return res.body; },
    get responseTime() { return res.responseTime ?? 0; },
    headers: {
      get: (key: string) => res.headers[key.toLowerCase()] ?? res.headers[key],
      toObject: () => ({ ...res.headers }),
      has: (key: string) => (key.toLowerCase() in res.headers) || (key in res.headers),
    },
    json: () => {
      try { return JSON.parse(res.body); } catch { return null; }
    },
    text: () => res.body,
  };

  const envReadOnly = {
    get: (key: string) => envVars[key],
    has: (key: string) => key in envVars,
    toObject: () => ({ ...envVars }),
  };

  const expect = buildExpect();

  const lpObj = {
    test: (name: string, fn: () => void) => {
      const start = Date.now();
      try {
        fn();
        tests.push({ name, passed: true, durationMs: Date.now() - start });
      } catch (e) {
        tests.push({
          name,
          passed: false,
          error: e instanceof Error ? e.message : String(e),
          durationMs: Date.now() - start,
        });
      }
    },
    expect,
    response: lpResponse,
    environment: envReadOnly,
  };

  const consoleMock = {
    log: (...args: unknown[]) => { logs.push(args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")); },
    warn: (...args: unknown[]) => { logs.push("[WARN] " + args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")); },
    error: (...args: unknown[]) => { logs.push("[ERROR] " + args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")); },
    info: (...args: unknown[]) => { logs.push(args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")); },
  };

  const sandbox = vm.createContext({ lp: lpObj, console: consoleMock });
  try {
    new vm.Script(script).runInContext(sandbox, { timeout: SCRIPT_TIMEOUT_MS });
  } catch (e) {
    // If the script itself throws outside of lp.test(), add as a top-level error
    const errMsg = e instanceof Error ? e.message : String(e);
    if (tests.length === 0) {
      tests.push({ name: "Script execution", passed: false, error: errMsg, durationMs: 0 });
    } else {
      logs.push(`[ERROR] Uncaught: ${errMsg}`);
    }
  }

  return { envVars, testResults: tests, testLogs: logs };
}
