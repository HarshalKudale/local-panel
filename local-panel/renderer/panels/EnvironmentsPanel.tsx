import React, { useState, useCallback } from "react";
import { AppConfig, Environment, EnvVariable } from "@/types";
import { Globe, Plus, X, History, ChevronRight } from "@/lib/icons";
import { Button, IconButton, EmptyState, PanelLayout } from "@/components/ui";


let _vid = 0;
const mkVid = () => `v${++_vid}`;

interface Props {
  config: AppConfig;
  onConfigChange: (cfg: AppConfig) => Promise<void>;
  onHistoryOpen?: (filePath: string) => void;
  onAfterSave?: () => void;
}

// ── Variable row editor ────────────────────────────────────────────────────

function VarRow({
  row,
  onUpdate,
  onDelete,
}: {
  row: EnvVariable;
  onUpdate: (patch: Partial<EnvVariable>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-stretch border-b border-border/25 last:border-0 group hover:bg-bg2/30">
      <div className="flex-1 border-r border-border/25 min-w-0">
        <input
          className="w-full h-full bg-transparent font-mono text-xs px-3 py-2 outline-none focus:bg-bg2/60"
          style={{ color: "var(--c-accent)" }}
          placeholder="VARIABLE_NAME"
          value={row.key}
          onChange={(e) => onUpdate({ key: e.target.value })}
        />
      </div>
      <div className="flex-1 min-w-0">
        <input
          className="w-full h-full bg-transparent font-mono text-xs text-text-bright px-3 py-2 outline-none focus:bg-bg2/60"
          placeholder="value"
          value={row.value}
          onChange={(e) => onUpdate({ value: e.target.value })}
        />
      </div>
      <button
        onClick={onDelete}
        className="w-9 flex-shrink-0 flex items-center justify-center text-text-dim hover:text-red opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ── Environment editor ─────────────────────────────────────────────────────

function EnvEditor({
  env,
  isActive,
  collapsed,
  onToggle,
  onSave,
  onDelete,
  onActivate,
  onHistory,
}: {
  env: Environment;
  isActive: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onSave: (updated: Environment) => Promise<void>;
  onDelete: () => Promise<void>;
  onActivate: () => Promise<void>;
  onHistory?: () => void;
}) {
  const [name, setName] = useState(env.name);
  const [vars, setVars] = useState<EnvVariable[]>(() => env.variables.map((v) => ({ ...v })));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const markDirty = () => setDirty(true);

  const updateVar = (id: string, patch: Partial<EnvVariable>) => {
    setVars((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    markDirty();
  };

  const deleteVar = (id: string) => {
    setVars((prev) => prev.filter((v) => v.id !== id));
    markDirty();
  };

  const addVar = () => {
    setVars((prev) => [...prev, { id: mkVid(), key: "", value: "" }]);
    markDirty();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ ...env, name: name.trim() || env.name, variables: vars.filter((v) => v.key.trim()) });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-lg border overflow-hidden ${isActive ? "border-accent/50 bg-accent/5" : "border-border bg-bg1"}`}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-border cursor-pointer select-none hover:bg-bg2/20 transition-colors"
        onClick={onToggle}
      >
        <ChevronRight
          size={13}
          className={`text-text-dim flex-shrink-0 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
        />
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-accent" : "bg-text-dim/30"}`}
          style={{ boxShadow: isActive ? "0 0 6px var(--c-accent)" : "none" }}
        />
        <input
          className="flex-1 bg-transparent text-sm font-semibold text-text-bright outline-none placeholder:text-text-dim min-w-0 cursor-pointer"
          value={name}
          onChange={(e) => { setName(e.target.value); markDirty(); }}
          placeholder="Environment name"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {!isActive && (
            <button
              onClick={onActivate}
              className="px-2.5 py-1 rounded border border-border bg-bg2 hover:border-accent/50 hover:bg-accent/10 hover:text-accent text-text-dim text-xs font-medium transition-all cursor-pointer"
            >
              Set Active
            </button>
          )}
          {isActive && (
            <span className="px-2.5 py-1 rounded border border-accent/40 bg-accent/10 text-accent text-xs font-semibold">
              Active
            </span>
          )}
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2.5 py-1 rounded border border-green/40 bg-green/10 hover:bg-green/20 text-green text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          {onHistory && (
            <IconButton
              icon={<History size={12} />}
              title="View history"
              onClick={onHistory}
              className="hover:text-accent"
            />
          )}
          <button
            onClick={onDelete}
            className="px-2.5 py-1 rounded border border-border bg-bg2 hover:border-red/40 hover:bg-red/10 hover:text-red text-text-dim text-xs font-medium transition-all cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Variables table — hidden when collapsed */}
      {!collapsed && <div>
        <div className="flex items-center border-b border-border/60 bg-bg0/20">
          <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim border-r border-border/40">
            Variable
          </div>
          <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
            Value
          </div>
          <div className="w-9 flex-shrink-0" />
        </div>

        {vars.length === 0 && (
          <p className="px-4 py-4 text-xs text-text-dim italic">No variables — click Add Variable below</p>
        )}

        {vars.map((v) => (
          <VarRow key={v.id} row={v} onUpdate={(p) => updateVar(v.id, p)} onDelete={() => deleteVar(v.id)} />
        ))}

        <button
          onClick={addVar}
          className="flex items-center gap-2 px-4 py-2.5 text-xs text-text-dim hover:text-text-base hover:bg-bg2/30 transition-colors cursor-pointer w-full text-left border-t border-border/20"
        >
          <span className="text-accent font-semibold text-sm leading-none">+</span>Add Variable
        </button>
      </div>}
    </div>
  );
}

// ── EnvironmentsPanel ──────────────────────────────────────────────────────

export default function EnvironmentsPanel({ config, onConfigChange, onHistoryOpen, onAfterSave }: Props) {
  const envs = config.environments ?? [];
  const activeId = config.activeEnvironmentId ?? null;


  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(activeId ? [activeId] : [])
  );

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Active env first, then alphabetically
  const sortedEnvs = [...envs].sort((a, b) => {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    return 0;
  });

  const reloadConfig = useCallback(async () => {
    const fresh = await window.api.getConfig();
    await onConfigChange(fresh);
  }, [onConfigChange]);

  const handleAdd = async () => {
    await window.api.addEnvironment({ name: "New Environment", variables: [] });
    await reloadConfig();
  };

  const handleSave = useCallback(async (updated: Environment) => {
    await window.api.updateEnvironment(updated);
    await reloadConfig();
    onAfterSave?.();
  }, [reloadConfig, onAfterSave]);

  const handleDelete = useCallback(async (id: string) => {
    await window.api.deleteEnvironment(id);
    await reloadConfig();
  }, [reloadConfig]);

  const handleActivate = useCallback(async (id: string) => {
    await window.api.setActiveEnvironment(id);
    await reloadConfig();
  }, [reloadConfig]);

  return (
    <>
      <PanelLayout
        title="Environments"
        subtitle={<>Define variable sets. Use <code className="font-mono bg-bg3 px-1 rounded text-text-bright text-[11px]">{"{{VARIABLE}}"}</code> in URLs, headers, and request/response bodies.</>}
        actions={
          <>
            <Button variant="secondary" icon={<Plus size={12} />} onClick={handleAdd}>New Environment</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {envs.length === 0 ? (
            <EmptyState
              fill
              icon={<Globe size={36} />}
              title="No environments yet"
              description={
                <>
                  Create environments to manage variable sets for different stages (dev, staging, production).{" "}
                  Use <code className="font-mono bg-bg3 px-1 rounded">{"{{VAR}}"}</code> syntax anywhere in your requests and mocks.
                </>
              }
            />
          ) : (
            sortedEnvs.map((env) => (
              <EnvEditor
                key={env.id}
                env={env}
                isActive={env.id === activeId}
                collapsed={!expandedIds.has(env.id)}
                onToggle={() => toggleExpanded(env.id)}
                onSave={handleSave}
                onDelete={() => handleDelete(env.id)}
                onActivate={async () => {
                  await handleActivate(env.id);
                  setExpandedIds((prev) => new Set([...prev, env.id]));
                }}
                onHistory={onHistoryOpen ? () => onHistoryOpen(`environments/${env.id}.json`) : undefined}
              />
            ))
          )}
        </div>
      </PanelLayout>
    </>
  );
}