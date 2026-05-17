/**
 * EditorTab — unified tab body used by both RequestEditor and MockEditorModal.
 *
 * mode="request"  Left: editable request  | Right: live response (read-only, populated after Send)
 * mode="mock"     Left: captured request (read-only) | Right: editable mock response
 *
 * The left/right split is 50/50 by default and freely resizable by dragging the divider.
 * All behaviour is driven by props; callers own state, draft-save, etc.
 */

import React, { useCallback, useRef, useState, useEffect } from "react";
import { Group as PanelGroup, Panel, Separator as ResizeHandle } from "react-resizable-panels";
import HeaderTable from "@/components/editor/HeaderTable";
import BodyEditor, { BodyEditorHandle } from "@/components/editor/BodyEditor";
import CodeEditor from "@/components/common/CodeEditor";
import BinaryViewer from "@/components/common/BinaryViewer";
import EnvVarHint from "@/components/editor/EnvVarHint";
import RandomizerHint from "@/components/editor/RandomizerHint";
import { TabStrip } from "@/components/editor/RequestTab";
import { KVRow, headersToRows, statusColor, mkRowId } from "@/lib/utils";
import { BodyMode, isBinaryContentType } from "@/lib/bodyUtils";
import { strings } from "@/lib/strings";
import { Environment } from "@/types";

// ── Status dropdown options (mock only) ────────────────────────────────────

const STATUS_OPTIONS = [
  { v: 200, label: "200  OK" },
  { v: 201, label: "201  Created" },
  { v: 204, label: "204  No Content" },
  { v: 301, label: "301  Moved Permanently" },
  { v: 302, label: "302  Found" },
  { v: 304, label: "304  Not Modified" },
  { v: 400, label: "400  Bad Request" },
  { v: 401, label: "401  Unauthorized" },
  { v: 403, label: "403  Forbidden" },
  { v: 404, label: "404  Not Found" },
  { v: 405, label: "405  Method Not Allowed" },
  { v: 409, label: "409  Conflict" },
  { v: 422, label: "422  Unprocessable Entity" },
  { v: 429, label: "429  Too Many Requests" },
  { v: 500, label: "500  Internal Server Error" },
  { v: 502, label: "502  Bad Gateway" },
  { v: 503, label: "503  Service Unavailable" },
];

// ── Props ──────────────────────────────────────────────────────────────────

export type EditorMode = "request" | "mock";

/** Props relevant to the request (left) pane */
export interface RequestPaneProps {
  reqTab: "params" | "headers" | "body" | "pre-script";
  onReqTabChange(t: "params" | "headers" | "body" | "pre-script"): void;
  reqParams?: KVRow[];
  onReqParamsChange?(rows: KVRow[]): void;
  reqHeaders: KVRow[];
  onReqHeadersChange(rows: KVRow[]): void;
  reqBody: string;
  onReqBodyChange(v: string): void;
  reqMode: BodyMode;
  onReqModeChange?(m: BodyMode): void;
  /** Set true when the left pane is read-only (mock mode captured request) */
  reqReadOnly?: boolean;
  preScript?: string;
  onPreScriptChange?(v: string): void;
}

/** Props relevant to the response (right) pane — varies by mode */
export interface ResponsePaneProps {
  resTab: "body" | "headers" | "post-script";
  onResTabChange(t: "body" | "headers" | "post-script"): void;

  // mock mode: editable response
  resBody?: string;
  onResBodyChange?(v: string): void;
  resHeaders?: KVRow[];
  onResHeadersChange?(rows: KVRow[]): void;
  resMode?: BodyMode;
  onResModeChange?(m: BodyMode): void;
  resStatus?: number;
  onResStatusChange?(s: number): void;
  /** Response delay in ms (mock mode only) */
  resDelay?: number;
  onResDelayChange?(ms: number): void;
  /** Response body encoding (mock mode): "base64" for binary bodies */
  resBodyEncoding?: "utf8" | "base64";
  /** Streaming mode (mock only) */
  streamingMode?: "none" | "sse" | "chunked";
  onStreamingModeChange?(mode: "none" | "sse" | "chunked"): void;
  streamingChunkDelay?: number;
  onStreamingChunkDelayChange?(ms: number): void;
  streamingChunkSeparator?: string;
  onStreamingChunkSeparatorChange?(sep: string): void;

  // request mode: read-only result populated after Send
  loading?: boolean;
  sendErr?: string | null;
  result?: { status: number; headers: Record<string, string>; body: string } | null;
  resBodyText?: string;
  onCreateMock?(): void;
  postScript?: string;
  onPostScriptChange?(v: string): void;
  scriptErr?: string | null;
}

export interface EditorTabProps extends RequestPaneProps, ResponsePaneProps {
  mode: EditorMode;
  /** Active environment for variable/env hints */
  activeEnv?: Environment | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function EditorTab({
  mode,
  activeEnv = null,
  // request pane
  reqTab, onReqTabChange,
  reqParams = [], onReqParamsChange,
  reqHeaders, onReqHeadersChange,
  reqBody, onReqBodyChange,
  reqMode, onReqModeChange,
  reqReadOnly = false,
  preScript, onPreScriptChange,
  // response pane
  resTab, onResTabChange,
  resBody, onResBodyChange,
  resHeaders, onResHeadersChange,
  resMode, onResModeChange,
  resStatus, onResStatusChange,
  resDelay, onResDelayChange,
  resBodyEncoding,
  streamingMode, onStreamingModeChange,
  streamingChunkDelay, onStreamingChunkDelayChange,
  streamingChunkSeparator, onStreamingChunkSeparatorChange,
  loading, sendErr, result, resBodyText, onCreateMock,
  postScript, onPostScriptChange,
  scriptErr,
}: EditorTabProps) {
  const reqParamCount = reqParams.filter((r) => r.enabled && r.key.trim()).length;
  const reqHeaderCount = reqHeaders.filter((r) => r.enabled && r.key.trim()).length;
  const resHeaderCount = (resHeaders ?? []).filter((r) => r.enabled && r.key.trim()).length;

  // Refs for body editors – used to insert tokens at cursor
  const reqBodyRef = useRef<BodyEditorHandle>(null);
  const resBodyRef = useRef<BodyEditorHandle>(null);

  // ── Left pane (Request) ──────────────────────────────────────────────────

  const preScriptDot = preScript?.trim() ? " ●" : "";

  const leftPane = (
    <div className="flex flex-col h-full overflow-hidden">
      <TabStrip
        tabs={[
          ...(!reqReadOnly ? [{ id: "params" as const, label: `Params${reqParamCount > 0 ? ` (${reqParamCount})` : ""}` }] : []),
          { id: "headers" as const, label: `${strings.editor.headers}${reqHeaderCount > 0 ? ` (${reqHeaderCount})` : ""}` },
          { id: "body" as const, label: strings.editor.body },
          ...(!reqReadOnly ? [{ id: "pre-script" as const, label: `${strings.editor.preScript}${preScriptDot}` }] : []),
        ]}
        active={reqTab}
        onChange={onReqTabChange}
        prefix={
          <span className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-dim border-r border-border whitespace-nowrap">
            {strings.editor.request}
          </span>
        }
        suffix={
          reqReadOnly
            ? <span className="px-3 text-[9px] text-text-dim italic opacity-60">{strings.editor.readOnly}</span>
            : undefined
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        {reqTab === "params" && !reqReadOnly && (
          <HeaderTable
            rows={reqParams}
            onChange={onReqParamsChange ?? (() => { })}
            emptyMessage="No query params — add a row or type ?key=value in the URL"
          />
        )}
        {reqTab === "headers" && (
          <>
            {!reqReadOnly && (
              <TokenToolbar
                env={activeEnv ?? null}
                onInsert={(token) => {
                  if (!insertAtActiveInput(token)) {
                    onReqHeadersChange(appendTokenToFocusedRow(reqHeaders, token));
                  }
                }}
              />
            )}
            <HeaderTable
              rows={reqHeaders}
              onChange={onReqHeadersChange}
              readOnly={reqReadOnly}
              emptyMessage={reqReadOnly ? strings.common.noHeadersCaptured : undefined}
            />
          </>
        )}
        {reqTab === "body" && (
          <>
            {!reqReadOnly && (
              <TokenToolbar
                env={activeEnv ?? null}
                onInsert={(token) => reqBodyRef.current?.insertAtCursor(token)}
              />
            )}
            <BodyEditor
              ref={reqReadOnly ? undefined : reqBodyRef}
              value={reqBody}
              onChange={onReqBodyChange}
              readOnly={reqReadOnly}
              placeholder={reqReadOnly ? "No request body captured" : "Request body (optional)"}
              mode={reqMode}
              onModeChange={reqReadOnly ? undefined : onReqModeChange}
            />
          </>
        )}
        {reqTab === "pre-script" && !reqReadOnly && (
          <ScriptEditor
            value={preScript ?? ""}
            onChange={onPreScriptChange ?? (() => { })}
            placeholder={strings.editor.scriptPlaceholder}
          />
        )}
      </div>
    </div>
  );

  // ── Right pane (Response) ────────────────────────────────────────────────

  let rightPane: React.ReactNode;

  if (mode === "mock") {
    // Editable mock response
    rightPane = (
      <div className="flex flex-col h-full overflow-hidden">
        <TabStrip
          tabs={[
            { id: "body" as const, label: strings.editor.body },
            { id: "headers" as const, label: `${strings.editor.headers}${resHeaderCount > 0 ? ` (${resHeaderCount})` : ""}` },
          ]}
          active={resTab}
          onChange={onResTabChange}
          prefix={
            <span className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-dim border-r border-border whitespace-nowrap">
              {strings.editor.response}
            </span>
          }
          suffix={
            <div className="flex items-center gap-2 pr-3">
              <span className="text-[10px] text-text-dim flex-shrink-0">Delay</span>
              <input
                type="number"
                min={0}
                step={100}
                value={resDelay ?? 0}
                onChange={(e) => onResDelayChange?.(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="bg-bg2 border border-border rounded px-2 py-1 text-xs font-mono text-text-bright outline-none focus:border-accent w-16 text-center"
                placeholder="0"
                title="Response delay in milliseconds"
              />
              <span className="text-[10px] text-text-dim flex-shrink-0">ms</span>
              {/* Streaming mode selector */}
              <select
                value={streamingMode ?? "none"}
                onChange={(e) => onStreamingModeChange?.(e.target.value as "none" | "sse" | "chunked")}
                className="bg-bg2 border border-border rounded px-1.5 py-1 text-[10px] font-mono text-text-bright outline-none focus:border-accent cursor-pointer"
                title="Streaming mode"
              >
                <option value="none">No Stream</option>
                <option value="sse">SSE</option>
                <option value="chunked">Chunked</option>
              </select>
              {streamingMode && streamingMode !== "none" && (
                <>
                  <input
                    type="number"
                    min={10}
                    step={50}
                    value={streamingChunkDelay ?? 100}
                    onChange={(e) => onStreamingChunkDelayChange?.(Math.max(10, parseInt(e.target.value, 10) || 100))}
                    className="bg-bg2 border border-border rounded px-2 py-1 text-xs font-mono text-text-bright outline-none focus:border-accent w-14 text-center"
                    title="Chunk delay in ms"
                  />
                  <span className="text-[10px] text-text-dim flex-shrink-0">ms/chunk</span>
                </>
              )}
              <input
                type="number"
                min={100}
                max={599}
                value={resStatus ?? 200}
                onChange={(e) => onResStatusChange?.(parseInt(e.target.value, 10) || 200)}
                className="bg-bg2 border border-border rounded px-2 py-1 text-sm font-bold font-mono outline-none focus:border-accent w-16 text-center"
                style={{ color: statusColor(resStatus ?? 200) }}
                title="Response status code"
              />
            </div>
          }
        />
        <div className="flex-1 overflow-y-auto min-h-0">
          {resTab === "body" && (
            <>
              {(resMode !== "binary" && resMode !== "image") && (
                <TokenToolbar
                  env={activeEnv ?? null}
                  onInsert={(token) => resBodyRef.current?.insertAtCursor(token)}
                />
              )}
              <BodyEditor
                ref={resBodyRef}
                value={resBody ?? ""}
                onChange={onResBodyChange ?? (() => { })}
                placeholder='{"mocked": true}'
                mode={resMode ?? "json"}
                onModeChange={onResModeChange}
                isBase64={resBodyEncoding === "base64"}
                contentType={
                  (resHeaders ?? []).find(r => r.key.toLowerCase() === "content-type")?.value ?? undefined
                }
              />
            </>
          )}
          {resTab === "headers" && (
            <>
              <TokenToolbar
                env={activeEnv ?? null}
                onInsert={(token) => {
                  if (!insertAtActiveInput(token)) {
                    onResHeadersChange?.(appendTokenToFocusedRow(resHeaders ?? [], token));
                  }
                }}
              />
              <HeaderTable rows={resHeaders ?? []} onChange={onResHeadersChange ?? (() => { })} />
            </>
          )}
        </div>
      </div>
    );
  } else {
    // Read-only live response (request mode)
    const postScriptDot = postScript?.trim() ? " ●" : "";
    rightPane = (
      <div className="flex flex-col h-full overflow-hidden">
        <TabStrip
          tabs={[
            { id: "body" as const, label: strings.editor.body },
            { id: "headers" as const, label: strings.editor.headers },
            { id: "post-script" as const, label: `${strings.editor.postScript}${postScriptDot}` },
          ]}
          active={resTab}
          onChange={onResTabChange}
          prefix={
            <span className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-dim border-r border-border whitespace-nowrap">
              {strings.editor.response}
            </span>
          }
          suffix={
            <div className="flex items-center gap-2 pr-3">
              {result && (
                <span className="text-sm font-bold font-mono" style={{ color: statusColor(result.status) }}>
                  {result.status}
                </span>
              )}
              {result && onCreateMock && (
                <button
                  onClick={onCreateMock}
                  title={strings.requests.createMockTitle}
                  className="px-2.5 py-1 rounded border border-yellow/30 bg-yellow/10 hover:bg-yellow/20 text-yellow text-[10px] font-semibold cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  {strings.requests.createMock}
                </button>
              )}
            </div>
          }
        />
        <div className="flex-1 overflow-y-auto min-h-0">
          {resTab === "post-script" ? (
            <ScriptEditor
              value={postScript ?? ""}
              onChange={onPostScriptChange ?? (() => { })}
              placeholder={strings.editor.postScriptPlaceholder}
              error={scriptErr ?? undefined}
            />
          ) : (
            <>
              {loading && (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-2 text-text-dim">
                    <span className="inline-block w-5 h-5 border-2 border-text-dim/30 border-t-accent rounded-full animate-spin" />
                    <span className="text-xs">{strings.server.sending}</span>
                  </div>
                </div>
              )}
              {!loading && sendErr && (
                <div className="p-4">
                  <div className="px-3 py-2 rounded border border-red/30 bg-red/5 text-xs text-red font-mono">{sendErr}</div>
                </div>
              )}
              {!loading && !sendErr && !result && (
                <div className="flex items-center justify-center h-full text-center">
                  <div>
                    <div className="text-3xl opacity-20 mb-2">→</div>
                    <p className="text-xs text-text-dim">{strings.requests.hitSendPrompt}</p>
                  </div>
                </div>
              )}
              {result && !loading && (
                <>
                  {resTab === "body" && (
                    (() => {
                      const resCt = (result.headers["content-type"] ?? "").toLowerCase();
                      if (isBinaryContentType(resCt) && result.body) {
                        return <BinaryViewer data={result.body} contentType={resCt.split(";")[0].trim()} />;
                      }
                      return (
                        <BodyEditor
                          value={resBodyText ?? ""}
                          placeholder={strings.common.emptyBody}
                          readOnly
                          mode={resMode ?? "json"}
                        />
                      );
                    })()
                  )}
                  {resTab === "headers" && (
                    <HeaderTable rows={headersToRows(result.headers)} onChange={() => { }} readOnly />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Layout ───────────────────────────────────────────────────────────────
  // Mock mode: response pane only (no captured-request left pane needed)
  // Request mode: resizable 50/50 split

  if (mode === "mock") {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {rightPane}
      </div>
    );
  }

  return (
    <PanelGroup orientation="horizontal" className="flex flex-1 min-h-0 overflow-hidden">
      <Panel defaultSize={50} minSize={20} className="flex flex-col overflow-hidden">
        {leftPane}
      </Panel>
      <ResizeHandle className="w-1 bg-border hover:bg-accent/40 active:bg-accent/60 transition-colors cursor-col-resize flex-shrink-0" />
      <Panel defaultSize={50} minSize={20} className="flex flex-col overflow-hidden">
        {rightPane}
      </Panel>
    </PanelGroup>
  );
}

// ── ScriptEditor ─────────────────────────────────────────────────────────────

function ScriptEditor({ value, onChange, placeholder, error }: {
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {error && (
        <div className="px-3 py-1.5 border-b border-red/30 bg-red/5 flex-shrink-0">
          <span className="text-[11px] text-red font-mono">{strings.editor.scriptError}: {error}</span>
        </div>
      )}
      <CodeEditor
        value={value}
        onChange={onChange}
        language="javascript"
        placeholder={placeholder}
        className="flex-1 overflow-hidden"
      />
    </div>
  );
}

// ── TokenToolbar ──────────────────────────────────────────────────────────────

/**
 * A slim toolbar row that renders EnvVarHint + RandomizerHint buttons.
 * Placed above HeaderTable or BodyEditor to let users insert tokens.
 */
function TokenToolbar({ env, onInsert }: { env: Environment | null; onInsert(token: string): void }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/40 bg-bg0/10 flex-shrink-0 justify-end">
      <span className="text-[9px] text-text-dim/60 uppercase tracking-wider mr-1">Insert</span>
      <EnvVarHint env={env} onInsert={onInsert} />
      <RandomizerHint onInsert={onInsert} />
    </div>
  );
}

// ── appendTokenToFocusedRow ───────────────────────────────────────────────────

/**
 * Appends a token to the last enabled row's value in the header table.
 * If the table is empty, a new row is created.
 */
function appendTokenToFocusedRow(rows: KVRow[], token: string): KVRow[] {
  if (rows.length === 0) {
    return [{ id: mkRowId(), enabled: true, key: "", value: token }];
  }
  // Find last enabled row
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].enabled) {
      return rows.map((r, idx) => idx === i ? { ...r, value: r.value + token } : r);
    }
  }
  // All disabled — append to last
  return rows.map((r, idx) => idx === rows.length - 1 ? { ...r, value: r.value + token } : r);
}

// ── insertAtActiveInput ───────────────────────────────────────────────────────

/**
 * Inserts a token at the cursor position of the currently focused input element.
 * Relies on the hint buttons using onMouseDown + preventDefault to keep focus.
 * Returns true if insertion succeeded, false if no suitable input was focused.
 */
function insertAtActiveInput(token: string): boolean {
  const el = document.activeElement as HTMLInputElement | null;
  if (!el || el.tagName !== "INPUT" || el.readOnly) return false;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const newValue = el.value.slice(0, start) + token + el.value.slice(end);
  // Trigger React's synthetic onChange via the native value setter trick
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (!nativeSetter) return false;
  nativeSetter.call(el, newValue);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  // Restore cursor after state update flush
  const cursorPos = start + token.length;
  setTimeout(() => el.setSelectionRange(cursorPos, cursorPos), 0);
  return true;
}
