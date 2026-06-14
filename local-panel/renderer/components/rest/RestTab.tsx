import React, {
  forwardRef, useImperativeHandle, useReducer, useCallback, useEffect, useState,
} from "react";
import { SavedRequest, MockRule, Folder, Environment, ReplayResult } from "@/types";
import EditorTitleBar from "@/components/editor/EditorTitleBar";
import EditorTab from "@/components/editor/EditorTab";
import { UrlBar, BottomBar } from "@/components/editor/RequestTab";
import {
  tabReducer, initState, stateToSavePayload, stateToDraft, isDraftEmpty,
  TabType, TabState,
  RequestDraft, MockDraft,
} from "@/components/rest/restTabReducer";
import { useDraftPersist, loadDraft } from "@/lib/useDraftPersist";
import { resolveVars, resolveHeaders } from "@/lib/resolveVars";
import { rowsToHeaders, b64ToText, textToB64, tryFormat, METHODS, MOCK_METHODS } from "@/lib/utils";
import { parseCurl, SKIP_CURL_HEADERS } from "@/lib/curlParser";
import { contentTypeToMode, isBinaryContentType } from "@/lib/bodyUtils";
import { strings } from "@/lib/strings";
import { runPreScript, runPostScript } from "@/lib/scriptRunner";
import { runTestScript } from "@/lib/testRunner";
import { ChevronDown } from "@/lib/icons";

// -- Public handle for imperative refresh -----------------------------------

export interface RestTabHandle {
  refresh(entity: SavedRequest | MockRule): void;
}

// -- Props ------------------------------------------------------------------

export interface RestTabProps {
  tabType: TabType;
  tabId: string;
  /** Present for unsaved/draft tabs to enable draft auto-save */
  draftTabId?: string | null;
  initial?: SavedRequest | MockRule | Partial<SavedRequest> | Partial<MockRule> | null;
  folders?: Folder[];
  activeEnv?: Environment | null;
  /** Called with the data to persist. Parent handles add vs update. */
  onSave(data: Omit<SavedRequest, "id" | "createdAt" | "workspaceId"> | Omit<MockRule, "id" | "createdAt" | "workspaceId">): Promise<void>;
  onClose(): void;
  /** Request mode only: open a new mock pre-filled from this request/response */
  onCreateMock?(initial: Partial<MockRule>): void;
  /** Called whenever the editor has unsaved changes (for tab dirty indicator) */
  onDirtyChange?(dirty: boolean): void;
  /** Show the cURL import section (for new/draft tabs) */
  showCurlImport?: boolean;
  /** Label shown in the title bar */
  label?: string;
}

// -- Component --------------------------------------------------------------

const RestTab = forwardRef<RestTabHandle, RestTabProps>(function RestTab(
  {
    tabType, tabId, draftTabId, initial, folders = [], activeEnv = null,
    onSave, onClose, onCreateMock, onDirtyChange, showCurlImport = false, label,
  },
  ref,
) {
  // Load draft from localStorage if applicable
  const draft = draftTabId
    ? (tabType === "request"
      ? loadDraft<RequestDraft>(draftTabId)
      : loadDraft<MockDraft>(draftTabId))
    : null;

  const [state, dispatch] = useReducer(
    tabReducer,
    undefined,
    () => initState(initial ?? null, draft, tabType),
  );

  // Track dirty state for the parent
  const [initialSnapshot] = useState(() => JSON.stringify(stateToDraft(initState(initial ?? null, draft, tabType), tabType)));
  useEffect(() => {
    const current = JSON.stringify(stateToDraft(state, tabType));
    onDirtyChange?.(current !== initialSnapshot);
  }, [state, tabType, initialSnapshot, onDirtyChange]);

  // Draft auto-save (no-op for saved tabs where draftTabId is null/undefined)
  const { markSaved } = useDraftPersist(
    draftTabId ?? null,
    () => stateToDraft(state, tabType),
    () => isDraftEmpty(state, tabType),
  );

  // Expose imperative refresh for sync updates
  useImperativeHandle(ref, () => ({
    refresh(entity: SavedRequest | MockRule) {
      dispatch({ type: "REFRESH", entity, tabType });
    },
  }), [tabType]);

  // -- cURL parsing ------------------------------------------------------

  const handleCurlChange = useCallback((v: string) => {
    dispatch({ type: "SET_FIELD", field: "curlInput", value: v });
    if (!v.trim().startsWith("curl")) return;
    const p = parseCurl(v.trim());
    const filtered: Record<string, string> = {};
    for (const [k, hv] of Object.entries(p.headers)) {
      if (!SKIP_CURL_HEADERS.has(k)) filtered[k] = hv;
    }
    dispatch({ type: "APPLY_CURL", url: p.url ?? "", method: p.method ?? "", headers: filtered, body: p.body ?? "" });
  }, []);

  // -- Regex toggle (mock only) -------------------------------------------

  const handleRegexToggle = useCallback((checked: boolean) => {
    dispatch({ type: "SET_FIELD", field: "useRegex", value: checked });
    dispatch({ type: "SET_FIELD", field: "regexError", value: "" });
    if (checked && state.url) {
      try { new RegExp(state.url); } catch { dispatch({ type: "SET_FIELD", field: "regexError", value: strings.editor.invalidRegex }); }
    }
  }, [state.url]);

  const handleUrlChange = useCallback((v: string) => {
    dispatch({ type: "SET_URL", url: v });
    if (state.useRegex) {
      try { new RegExp(v); dispatch({ type: "SET_FIELD", field: "regexError", value: "" }); }
      catch { dispatch({ type: "SET_FIELD", field: "regexError", value: strings.editor.invalidRegex }); }
    }
  }, [state.useRegex]);

  // -- Send (request mode) ------------------------------------------------

  const handleSend = useCallback(async () => {
    if (!state.url.trim()) return;
    dispatch({ type: "SEND_START" });
    try {
      const resolvedUrl = resolveVars(state.url.trim(), activeEnv);
      const resolvedHdr = resolveHeaders(rowsToHeaders(state.reqHeaders), activeEnv);
      const resolvedBod = resolveVars(state.reqBody, activeEnv);

      let finalUrl = resolvedUrl;
      let finalHeaders = resolvedHdr;
      let finalBody = resolvedBod;
      let scriptEnv = activeEnv;

      if (state.preScript.trim()) {
        const pre = await runPreScript(state.preScript, { method: state.method, url: finalUrl, headers: finalHeaders, body: finalBody }, activeEnv);
        if (pre.error) dispatch({ type: "SET_FIELD", field: "scriptErr", value: strings.editor.preScriptError.replace("{error}", pre.error) });
        finalUrl = pre.req.url;
        finalHeaders = pre.req.headers;
        finalBody = pre.req.body;
        if (activeEnv && Object.keys(pre.envVars).length > 0) {
          scriptEnv = { ...activeEnv, variables: Object.entries(pre.envVars).map(([key, value]) => ({ id: key, key, value })) };
        }
      }

      const sendStart = Date.now();
      const res: ReplayResult = await window.api.replayRequest(state.method, finalUrl, finalHeaders, textToB64(finalBody));
      const responseTime = Date.now() - sendStart;
      const ct = res.headers["content-type"];
      const resMode = ct ? contentTypeToMode(ct) : state.resMode;
      dispatch({ type: "SEND_SUCCESS", result: res, resMode });

      if (state.postScript.trim()) {
        const post = await runPostScript(
          state.postScript,
          { status: res.status, headers: res.headers, body: b64ToText(res.body) },
          scriptEnv,
        );
        if (post.error) {
          const existing = state.scriptErr;
          const postErr = strings.editor.postScriptError.replace("{error}", post.error);
          dispatch({ type: "SET_FIELD", field: "scriptErr", value: existing ? `${existing}; ${postErr}` : postErr });
        }
      }

      // Run test script if present
      if (state.testScript.trim()) {
        dispatch({ type: "RUN_TESTS_START" });
        const testResult = await runTestScript(
          state.testScript,
          { status: res.status, headers: res.headers, body: b64ToText(res.body), responseTime },
          scriptEnv,
        );
        dispatch({ type: "RUN_TESTS_DONE", results: testResult.tests, logs: testResult.logs });
      }
    } catch (e) {
      dispatch({ type: "SEND_ERROR", error: e instanceof Error ? e.message : strings.editor.requestFailed });
    }
  }, [state.url, state.method, state.reqHeaders, state.reqBody, state.preScript, state.postScript, state.testScript, state.resMode, state.scriptErr, activeEnv]);

  // -- Test (mock mode) ---------------------------------------------------

  const handleTest = useCallback(async () => {
    if (!state.url.trim()) return;
    dispatch({ type: "TEST_START" });
    try {
      const testMethod = state.method === "*" ? "GET" : state.method;
      const resolvedUrl = resolveVars(state.url.trim(), activeEnv);
      const resolvedHdr = resolveHeaders(rowsToHeaders(state.reqHeaders), activeEnv);
      const resolvedBod = resolveVars(state.reqBody, activeEnv);
      const bodyB64 = resolvedBod.trim() ? textToB64(resolvedBod) : "";
      const res: ReplayResult = await window.api.replayRequest(testMethod, resolvedUrl, resolvedHdr, bodyB64);
      const ct = res.headers["content-type"];
      const resMode = ct ? contentTypeToMode(ct) : state.resMode;
      const { headersToRows } = await import("@/lib/utils");
      const isBinaryRes = ct ? isBinaryContentType(ct) : false;
      const resBody = isBinaryRes
        ? res.body
        : (resMode === "json" ? tryFormat(b64ToText(res.body)) : b64ToText(res.body));
      dispatch({
        type: "TEST_SUCCESS",
        resStatus: res.status,
        resHeaders: Object.keys(res.headers).length > 0 ? headersToRows(res.headers) : state.resHeaders,
        resBody,
        resMode,
        resBodyEncoding: isBinaryRes ? "base64" : "utf8",
      });
    } catch (e) {
      dispatch({ type: "TEST_ERROR", error: e instanceof Error ? e.message : strings.editor.requestFailed });
    }
  }, [state.url, state.method, state.reqHeaders, state.reqBody, state.resMode, state.resHeaders, activeEnv]);

  // -- Save ---------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (tabType === "request" && !state.url.trim()) return;
    if (tabType === "mock" && (!state.url.trim() || (state.useRegex && !!state.regexError))) return;
    dispatch({ type: "SAVE_START" });
    try {
      await onSave(stateToSavePayload(state, tabType));
      markSaved();
      dispatch({ type: "SAVE_SUCCESS" });
    } catch (e) {
      dispatch({ type: "SAVE_ERROR", error: e instanceof Error ? e.message : strings.editor.saveFailed });
    }
  }, [state, tabType, onSave, markSaved]);

  // -- Create mock from current request/response -------------------------

  const handleCreateMock = useCallback(() => {
    if (!onCreateMock) return;
    const { result, resMode } = state;
    const resCt = result?.headers?.["content-type"] ?? "";
    const isBinaryRes = isBinaryContentType(resCt);
    onCreateMock({
      name: state.name.trim() || "",
      method: state.method,
      urlPattern: state.url.trim(),
      useRegex: false,
      capturedHeaders: rowsToHeaders(state.reqHeaders),
      capturedBody: textToB64(state.reqBody),
      responseStatus: result?.status ?? 200,
      responseHeaders: result?.headers ?? {},
      responseBody: isBinaryRes
        ? (result?.body ?? "")
        : (result ? (resMode === "json" ? tryFormat(b64ToText(result.body)) : b64ToText(result.body)) : "{}"),
      responseBodyEncoding: isBinaryRes ? "base64" : undefined,
    });
  }, [state, onCreateMock]);

  // -- Derived ------------------------------------------------------------

  const resBodyText = state.result
    ? (state.resMode === "json" ? tryFormat(b64ToText(state.result.body)) : b64ToText(state.result.body))
    : "";

  const canSave = tabType === "request"
    ? !!state.url.trim()
    : !!(state.url.trim() && !(state.useRegex && state.regexError) && (state.resMode === "none" || state.resBody.trim()));

  const actionLabel = tabType === "request" ? strings.server.send : strings.server.test;
  const actionLoading = tabType === "request" ? state.loading : state.testLoading;
  const actionLoadLabel = tabType === "request" ? strings.server.sending : strings.server.testing;
  const actionDisabled = tabType === "request" ? !state.url.trim() : !state.url.trim();
  const handleAction = tabType === "request" ? handleSend : handleTest;
  const methods = tabType === "request" ? METHODS : MOCK_METHODS;

  const titleLabel = label ?? (tabType === "request"
    ? (draftTabId ? strings.requests.newRequest : strings.requests.editRequest)
    : (draftTabId ? strings.mocks.newMock : strings.mocks.editMock));

  const namePlaceholder = tabType === "request" ? strings.requests.requestNamePlaceholder : strings.mocks.mockName;
  const urlPlaceholder = tabType === "request" ? strings.requests.urlPlaceholder : strings.mocks.urlPatternPlaceholder;

  const errorMsg = state.sendErr ?? state.saveErr ?? state.regexError ?? state.testError ?? null;

  // -- Render -------------------------------------------------------------

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg1">
      {/* Title bar */}
      <EditorTitleBar
        label={titleLabel}
        namePlaceholder={namePlaceholder}
        name={state.name}
        onNameChange={(v) => dispatch({ type: "SET_FIELD", field: "name", value: v })}
        onClose={onClose}
      />

      {/* cURL import - collapsible for request, always open for mock */}
      {showCurlImport && (
        tabType === "request" ? (
          <div className="px-4 flex-shrink-0 border-b border-border bg-bg0/30">
            <button
              onClick={() => dispatch({ type: "SET_FIELD", field: "showCurl", value: !state.showCurl })}
              className="flex items-center gap-1.5 py-2 text-[10px] font-semibold uppercase tracking-widest text-text-dim hover:text-text-base cursor-pointer transition-colors"
            >
              <span style={{ display: "flex", alignItems: "center", transition: "transform 0.15s ease", transform: state.showCurl ? "rotate(0deg)" : "rotate(-90deg)" }}>
                <ChevronDown size={10} />
              </span>
              {strings.requests.importFromCurl}
            </button>
            {state.showCurl && (
              <textarea
                className="w-full bg-bg2 border border-border focus:border-accent rounded px-3 py-2 text-xs font-mono text-text-bright outline-none resize-none placeholder:text-text-dim/50 mb-2"
                rows={3}
                placeholder={strings.requests.curlPlaceholder}
                value={state.curlInput}
                onChange={(e) => handleCurlChange(e.target.value)}
                spellCheck={false}
              />
            )}
          </div>
        ) : (
          <div className="px-4 py-3 border-b border-border flex-shrink-0 bg-bg0/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-dim">{strings.mocks.importFromCurl}</span>
              <span className="text-[10px] text-text-dim opacity-60">{strings.mocks.importFromCurlHint}</span>
            </div>
            <textarea
              className="w-full bg-bg2 border border-border focus:border-accent rounded px-3 py-2 text-xs font-mono text-text-bright outline-none resize-none placeholder:text-text-dim/50 transition-colors"
              rows={3}
              placeholder={strings.mocks.curlPlaceholder}
              value={state.curlInput}
              onChange={(e) => handleCurlChange(e.target.value)}
              spellCheck={false}
            />
          </div>
        )
      )}

      {/* URL bar */}
      <UrlBar
        method={state.method}
        onMethodChange={(v) => dispatch({ type: "SET_FIELD", field: "method", value: v })}
        url={state.url}
        onUrlChange={handleUrlChange}
        methods={methods}
        urlPlaceholder={urlPlaceholder}
        actionLabel={actionLabel}
        actionLoadingLabel={actionLoadLabel}
        actionLoading={actionLoading}
        actionDisabled={actionDisabled}
        onAction={handleAction}
        onEnter={tabType === "request" ? handleSend : undefined}
        activeEnv={activeEnv}
        showRandomizer={tabType !== "mock"}
        inputSuffix={
          tabType === "mock" ? (
            <label
              className="flex items-center gap-1.5 px-3 border-l border-border cursor-pointer select-none flex-shrink-0 hover:bg-bg2 transition-colors"
              title={strings.editor.matchUrlAsRegex}
            >
              <input
                type="checkbox"
                checked={state.useRegex}
                onChange={(e) => handleRegexToggle(e.target.checked)}
                className="accent-accent"
              />
              <span className="font-mono text-[11px] text-text-dim">.*</span>
            </label>
          ) : undefined
        }
      />

      {/* Error banner */}
      {errorMsg && (
        <div className="px-4 py-2 border-b border-border bg-red/5 flex-shrink-0">
          <span className="text-xs text-red font-mono">{errorMsg}</span>
        </div>
      )}

      {/* Split-pane editor body */}
      <EditorTab
        mode={tabType === "request" ? "request" : "mock"}
        activeEnv={activeEnv}
        reqTab={state.reqTab as "params" | "headers" | "body" | "pre-script"}
        onReqTabChange={(v) => dispatch({ type: "SET_FIELD", field: "reqTab", value: v })}
        reqParams={tabType === "request" ? state.reqParams : undefined}
        onReqParamsChange={tabType === "request" ? (rows) => dispatch({ type: "SET_PARAMS", params: rows }) : undefined}
        reqHeaders={state.reqHeaders}
        onReqHeadersChange={(rows) => dispatch({ type: "SET_HEADERS", target: "req", rows })}
        reqBody={state.reqBody}
        onReqBodyChange={(v) => dispatch({ type: "SET_FIELD", field: "reqBody", value: v })}
        reqMode={state.reqMode}
        onReqModeChange={(m) => dispatch({ type: "SET_REQ_MODE", mode: m })}
        reqReadOnly={tabType === "mock"}
        preScript={tabType === "request" ? state.preScript : undefined}
        onPreScriptChange={tabType === "request" ? (v) => dispatch({ type: "SET_FIELD", field: "preScript", value: v }) : undefined}
        resTab={state.resTab as "body" | "headers" | "post-script" | "tests"}
        onResTabChange={(v) => dispatch({ type: "SET_FIELD", field: "resTab", value: v })}
        resMode={state.resMode}
        // Request-mode response (read-only)
        loading={tabType === "request" ? state.loading : undefined}
        sendErr={tabType === "request" ? state.sendErr : undefined}
        result={tabType === "request" ? state.result : undefined}
        resBodyText={tabType === "request" ? resBodyText : undefined}
        onCreateMock={tabType === "request" && onCreateMock ? handleCreateMock : undefined}
        postScript={tabType === "request" ? state.postScript : undefined}
        onPostScriptChange={tabType === "request" ? (v) => dispatch({ type: "SET_FIELD", field: "postScript", value: v }) : undefined}
        scriptErr={tabType === "request" ? state.scriptErr : undefined}
        testScript={tabType === "request" ? state.testScript : undefined}
        onTestScriptChange={tabType === "request" ? (v) => dispatch({ type: "SET_FIELD", field: "testScript", value: v }) : undefined}
        testResults={tabType === "request" ? state.testResults : undefined}
        testLogs={tabType === "request" ? state.testLogs : undefined}
        testRunning={tabType === "request" ? state.testRunning : undefined}
        // Mock-mode response (editable)
        resBody={tabType === "mock" ? state.resBody : undefined}
        onResBodyChange={tabType === "mock" ? (v) => dispatch({ type: "SET_FIELD", field: "resBody", value: v }) : undefined}
        resHeaders={tabType === "mock" ? state.resHeaders : undefined}
        onResHeadersChange={tabType === "mock" ? (rows) => dispatch({ type: "SET_HEADERS", target: "res", rows }) : undefined}
        onResModeChange={tabType === "mock" ? (m) => dispatch({ type: "SET_RES_MODE", mode: m }) : undefined}
        resStatus={tabType === "mock" ? state.resStatus : undefined}
        onResStatusChange={tabType === "mock" ? (s) => dispatch({ type: "SET_FIELD", field: "resStatus", value: s }) : undefined}
        resDelay={tabType === "mock" ? state.resDelay : undefined}
        onResDelayChange={tabType === "mock" ? (ms) => dispatch({ type: "SET_FIELD", field: "resDelay", value: ms }) : undefined}
        resBodyEncoding={tabType === "mock" ? state.resBodyEncoding : undefined}
        streamingMode={tabType === "mock" ? state.streamingMode : undefined}
        onStreamingModeChange={tabType === "mock" ? (m) => dispatch({ type: "SET_FIELD", field: "streamingMode", value: m }) : undefined}
        streamingChunkDelay={tabType === "mock" ? state.streamingChunkDelay : undefined}
        onStreamingChunkDelayChange={tabType === "mock" ? (ms) => dispatch({ type: "SET_FIELD", field: "streamingChunkDelay", value: ms }) : undefined}
        streamingChunkSeparator={tabType === "mock" ? state.streamingChunkSeparator : undefined}
        onStreamingChunkSeparatorChange={tabType === "mock" ? (sep) => dispatch({ type: "SET_FIELD", field: "streamingChunkSeparator", value: sep }) : undefined}
      />

      {/* Bottom bar */}
      <BottomBar
        folders={folders}
        folderId={state.folderId}
        onFolderChange={(v) => dispatch({ type: "SET_FIELD", field: "folderId", value: v })}
        onCancel={onClose}
        onSave={handleSave}
        saveLabel={draftTabId ? (tabType === "request" ? strings.editor.saveRequest : strings.mocks.saveMock) : (tabType === "request" ? strings.editor.updateRequest : strings.editor.updateMock)}
        saveDisabled={!canSave}
        saving={state.saving}
        savingLabel={strings.server.saving}
        extraLeft={
          tabType === "mock" ? (
            !state.resBody.trim()
              ? <span className="text-[10px] text-text-dim italic">{strings.mocks.addResponseBody}</span>
              : <span className="text-[10px] text-text-dim">{strings.mocks.mocksNote}</span>
          ) : undefined
        }
      />
    </div>
  );
});

export default RestTab;
