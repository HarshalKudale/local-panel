import React, { useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { AppConfig, ProxyRule, Folder } from "@/types";
import EditorTitleBar from "@/components/editor/EditorTitleBar";
import { BottomBar } from "@/components/editor/RequestTab";
import CodeEditor from "@/components/common/CodeEditor";
import { useDraftPersist, loadDraft } from "@/lib/useDraftPersist";
import { strings } from "@/lib/strings";
import { Input, Select, FormField } from "@/components/ui";

// -- Types ------------------------------------------------------------------

export interface RuleTabHandle {
  refresh(rule: ProxyRule): void;
  save(): void;
}

interface RuleTabState {
  name: string;
  pattern: string;
  useRegex: boolean;
  targetType: "mapping" | "external";
  targetMappingId: string;
  targetExternal: string;
  requestScript: string;
  responseScript: string;
  folderId: string | null;
}

export interface RuleSavePayload {
  name: string;
  pattern: string;
  useRegex: boolean;
  targetType: "mapping" | "external";
  targetMappingId: string;
  targetExternal: string;
  requestScript: string;
  responseScript: string;
  folderId: string | null;
}

interface Props {
  tabId: string;
  draftTabId: string | null;
  initial: Partial<ProxyRule> | null;
  folders: Folder[];
  config: AppConfig;
  onSave(data: RuleSavePayload): Promise<void>;
  onClose(): void;
  enabled?: boolean;
  onToggleEnabled?: () => void;
}

// -- RuleDraft type for localStorage ---------------------------------------

interface RuleDraft {
  name?: string;
  pattern?: string;
  useRegex?: boolean;
  targetType?: "mapping" | "external";
  targetMappingId?: string;
  targetExternal?: string;
  requestScript?: string;
  responseScript?: string;
  folderId?: string | null;
}

function stateFromRule(rule: Partial<ProxyRule> | null): RuleTabState {
  return {
    name: rule?.name ?? "",
    pattern: rule?.pattern ?? "",
    useRegex: rule?.useRegex ?? true,
    targetType: rule?.targetType ?? "mapping",
    targetMappingId: rule?.targetMappingId ?? "",
    targetExternal: rule?.targetExternal ?? "",
    requestScript: rule?.requestScript ?? "",
    responseScript: rule?.responseScript ?? "",
    folderId: rule?.folderId ?? null,
  };
}

function stateFromDraft(draft: RuleDraft): RuleTabState {
  return {
    name: draft.name ?? "",
    pattern: draft.pattern ?? "",
    useRegex: draft.useRegex ?? true,
    targetType: draft.targetType ?? "mapping",
    targetMappingId: draft.targetMappingId ?? "",
    targetExternal: draft.targetExternal ?? "",
    requestScript: draft.requestScript ?? "",
    responseScript: draft.responseScript ?? "",
    folderId: draft.folderId ?? null,
  };
}

function isDraftEmpty(s: RuleTabState): boolean {
  return !s.name && !s.pattern && !s.requestScript && !s.responseScript;
}

// -- RuleTab component ------------------------------------------------------

export default forwardRef<RuleTabHandle, Props>(function RuleTab(
  { tabId, draftTabId, initial, folders, config, onSave, onClose, enabled, onToggleEnabled },
  ref,
) {
  const isDraft = draftTabId !== null;

  const [state, setState] = useState<RuleTabState>(() => {
    if (isDraft) {
      const saved = loadDraft<RuleDraft>(draftTabId);
      return saved ? stateFromDraft(saved) : stateFromRule(initial);
    }
    return stateFromRule(initial);
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof RuleTabState, string>>>({});
  const [scriptTab, setScriptTab] = useState<"request" | "response">("request");

  const set = useCallback(<K extends keyof RuleTabState>(key: K, val: RuleTabState[K]) => {
    setState((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }, []);

  // Draft auto-save
  const { markSaved } = useDraftPersist(
    draftTabId,
    () => ({
      name: state.name, pattern: state.pattern, useRegex: state.useRegex,
      targetType: state.targetType, targetMappingId: state.targetMappingId,
      targetExternal: state.targetExternal,
      requestScript: state.requestScript, responseScript: state.responseScript,
      folderId: state.folderId,
    } as RuleDraft),
    () => isDraftEmpty(state),
  );

  const validate = (): boolean => {
    const errs: Partial<Record<keyof RuleTabState, string>> = {};
    if (!state.pattern.trim()) errs.pattern = strings.proxyRules.patternRequired;
    if (state.useRegex) {
      try { new RegExp(state.pattern); } catch { errs.pattern = strings.proxyRules.invalidRegexPattern; }
    }
    if (state.targetType === "mapping" && !state.targetMappingId) {
      errs.targetMappingId = strings.proxyRules.selectTargetMapping;
    }
    if (state.targetType === "external" && !state.targetExternal.trim()) {
      errs.targetExternal = strings.proxyRules.enterHostPort;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        name: state.name,
        pattern: state.pattern.trim(),
        useRegex: state.useRegex,
        targetType: state.targetType,
        targetMappingId: state.targetMappingId,
        targetExternal: state.targetExternal.trim(),
        requestScript: state.requestScript,
        responseScript: state.responseScript,
        folderId: state.folderId,
      });
      markSaved();
    } finally {
      setSaving(false);
    }
  }, [state, onSave, markSaved]);

  // Imperative refresh handle (used by useEntityTabs when reloading a saved entity)
  useImperativeHandle(ref, () => ({
    refresh(rule: ProxyRule) {
      setState(stateFromRule(rule));
    },
    save() {
      void handleSave();
    },
  }), [handleSave]);

  const s = strings.proxyRules;

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <EditorTitleBar
        label={s.ruleLabel}
        namePlaceholder={s.ruleNamePlaceholder}
        name={state.name}
        onNameChange={(v) => set("name", v)}
        onClose={onClose}
        autoFocus={isDraft}
        enabled={enabled}
        onToggleEnabled={onToggleEnabled}
      />

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-h-0">
        {/* Match pattern */}
        <FormField label={s.matchUrl} error={errors.pattern}>
          <div className="flex items-center gap-2">
            <Input
              className="flex-1 font-mono"
              placeholder={state.useRegex ? "^https?://api\\.example\\.com/.*" : "https://api.example.com/endpoint"}
              value={state.pattern}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("pattern", e.target.value)}
              error={!!errors.pattern}
            />
            <button
              type="button"
              onClick={() => set("useRegex", !state.useRegex)}
              className={`px-3 py-1.5 rounded border text-xs font-semibold transition-colors cursor-pointer flex-shrink-0 ${state.useRegex
                ? "border-signal bg-signal/10 text-signal"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              title={state.useRegex ? s.switchToExact : s.switchToRegex}
            >
              {state.useRegex ? s.regexToggle : s.exactToggle}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {state.useRegex ? s.regexHelp : s.exactHelp}
          </p>
        </FormField>

        {/* Target */}
        <div>
          <div className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wider">{s.forwardTo}</div>
          <div className="flex items-center gap-3 mb-3">
            {(["mapping", "external"] as const).map((type) => (
              <label key={type} className="flex items-center gap-1.5 cursor-pointer text-sm text-foreground">
                <input
                  type="radio"
                  className="accent-signal"
                  checked={state.targetType === type}
                  onChange={() => set("targetType", type)}
                />
                {type === "mapping" ? s.targetMapping : s.targetExternal}
              </label>
            ))}
          </div>

          {state.targetType === "mapping" ? (
            <FormField label="" error={errors.targetMappingId}>
              <Select
                className="w-full"
                error={!!errors.targetMappingId}
                value={state.targetMappingId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("targetMappingId", e.target.value)}
              >
                <option value="">{s.selectMapping}</option>
                {(config.mappings ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.domain} → {m.target}</option>
                ))}
              </Select>
              {config.mappings.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">{s.noMappingsDefined}</p>
              )}
            </FormField>
          ) : (
            <FormField label="" error={errors.targetExternal}>
              <Input
                className="w-full font-mono"
                placeholder="api.example.com:8080 or 127.0.0.1:3000"
                value={state.targetExternal}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("targetExternal", e.target.value)}
                error={!!errors.targetExternal}
              />
              <p className="text-xs text-muted-foreground mt-1">host:port (e.g. api.example.com:8080 or 127.0.0.1:3000)</p>
            </FormField>
          )}
        </div>

        {/* Scripts */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-0 border-b border-border mb-0">
            {(["request", "response"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setScriptTab(tab)}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer -mb-px ${scriptTab === tab
                  ? "border-signal text-signal"
                  : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
              >
                {tab === "request" ? s.requestScript : s.responseScript}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-[200px] relative border-t border-border" style={{ minHeight: 200 }}>
            {scriptTab === "request" ? (
              <CodeEditor
                key="req-script"
                language="javascript"
                value={state.requestScript}
                onChange={(v) => set("requestScript", v)}
                placeholder={s.requestScriptPlaceholder}
                className="w-full h-full"
                minHeight={200}
              />
            ) : (
              <CodeEditor
                key="res-script"
                language="javascript"
                value={state.responseScript}
                onChange={(v) => set("responseScript", v)}
                placeholder={s.responseScriptPlaceholder}
                className="w-full h-full"
                minHeight={200}
              />
            )}
          </div>
        </div>
      </div>

      <BottomBar
        folders={folders}
        folderId={state.folderId}
        onFolderChange={(id) => set("folderId", id)}
        onCancel={onClose}
        onSave={handleSave}
        saveLabel={isDraft ? s.saveRule : s.updateRule}
        saving={saving}
        savingLabel={strings.server.saving}
      />
    </div>
  );
});
