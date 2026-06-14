import React, { useState, useCallback } from "react";
import { AppConfig, Environment, EnvVariable } from "@/types";
import { Globe, Plus, X, History } from "@/lib/icons";
import { Button, IconButton, EmptyState } from "@/components/ui";
import { strings } from "@/lib/strings";
import SidebarLayout, { SidebarHeader } from "@/components/ui/SidebarLayout";
import ActiveDot from "@/components/ui/ActiveDot";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

const GLOBAL_ENV_ID = "__global__";

let _vid = 0;
const mkVid = () => `v${++_vid}`;

interface Props {
  config: AppConfig;
  onConfigChange: (cfg: AppConfig) => Promise<void>;
  onHistoryOpen?: (filePath: string) => void;
  onAfterSave?: () => void;
}

// -- Variable row editor ----------------------------------------------------

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

// -- Variable editor (right panel content) ---------------------------------

function VariableEditor({
  env,
  isActive,
  isGlobal,
  onSave,
  onDelete,
  onActivate,
  onHistory,
}: {
  env: Environment;
  isActive: boolean;
  isGlobal: boolean;
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
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border flex-shrink-0">
        {isGlobal ? (
          <Globe size={15} className="text-accent flex-shrink-0" />
        ) : (
          <ActiveDot active={isActive} color="accent" size="sm" />
        )}
        {isGlobal ? (
          <span className="flex-1 text-sm font-semibold text-text-bright">Global</span>
        ) : (
          <input
            className="flex-1 bg-transparent text-sm font-semibold text-text-bright outline-none placeholder:text-text-dim min-w-0"
            value={name}
            onChange={(e) => { setName(e.target.value); markDirty(); }}
            placeholder={strings.environments.environmentName}
          />
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isGlobal && (
            <span className="px-2.5 py-1 rounded border border-accent/40 bg-accent/10 text-accent text-xs font-semibold">
              {strings.environments.alwaysActive}
            </span>
          )}
          {!isGlobal && !isActive && (
            <button
              onClick={onActivate}
              className="px-2.5 py-1 rounded border border-border bg-bg2 hover:border-accent/50 hover:bg-accent/10 hover:text-accent text-text-dim text-xs font-medium transition-all cursor-pointer"
            >
              {strings.environments.setActive}
            </button>
          )}
          {!isGlobal && isActive && (
            <span className="px-2.5 py-1 rounded border border-accent/40 bg-accent/10 text-accent text-xs font-semibold">
              {strings.environments.active}
            </span>
          )}
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2.5 py-1 rounded border border-green/40 bg-green/10 hover:bg-green/20 text-green text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? strings.server.saving : strings.common.save}
            </button>
          )}
          {onHistory && (
            <IconButton
              icon={<History size={12} />}
              title={strings.environments.viewHistory}
              onClick={onHistory}
              className="hover:text-accent"
            />
          )}
          {!isGlobal && (
            <button
              onClick={onDelete}
              className="px-2.5 py-1 rounded border border-border bg-bg2 hover:border-red/40 hover:bg-red/10 hover:text-red text-text-dim text-xs font-medium transition-all cursor-pointer"
            >
              {strings.common.delete}
            </button>
          )}
        </div>
      </div>

      {/* Variables table */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        <div className="flex items-center border-b border-border/60 bg-bg0/20 flex-shrink-0">
          <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim border-r border-border/40">
            Variable
          </div>
          <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
            Value
          </div>
          <div className="w-9 flex-shrink-0" />
        </div>

        {vars.length === 0 && (
          <p className="px-4 py-4 text-xs text-text-dim italic">{strings.environments.noVariables}</p>
        )}

        {vars.map((v) => (
          <VarRow key={v.id} row={v} onUpdate={(p) => updateVar(v.id, p)} onDelete={() => deleteVar(v.id)} />
        ))}

        <button
          onClick={addVar}
          className="flex items-center gap-2 px-4 py-2.5 text-xs text-text-dim hover:text-text-base hover:bg-bg2/30 transition-colors cursor-pointer w-full text-left border-t border-border/20"
        >
          <span className="text-accent font-semibold text-sm leading-none">+</span>{strings.environments.addVariable}
        </button>
      </div>
    </div>
  );
}

// -- Sidebar env item -------------------------------------------------------

function EnvItem({
  env,
  isActive,
  isSelected,
  isGlobal,
  onClick,
}: {
  env: Environment;
  isActive: boolean;
  isSelected: boolean;
  isGlobal: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
        isSelected ? "bg-accent/15 text-text-bright" : "hover:bg-bg2/50 text-text-base"
      }`}
    >
      {isGlobal ? (
        <Globe size={13} className={isSelected ? "text-accent" : "text-text-dim"} />
      ) : (
        <ActiveDot active={isActive} color="accent" size="sm" />
      )}
      <span className="flex-1 text-xs truncate">{env.name}</span>
      {isGlobal && (
        <span className="text-[9px] font-semibold uppercase tracking-wide text-accent opacity-70 flex-shrink-0">
          {strings.environments.alwaysActive}
        </span>
      )}
    </button>
  );
}

// -- EnvironmentsPanel ------------------------------------------------------

export default function EnvironmentsPanel({ config, onConfigChange, onHistoryOpen, onAfterSave }: Props) {
  const allEnvs = config.environments ?? [];
  const activeId = config.activeEnvironmentId ?? null;

  const globalEnv = allEnvs.find((e) => e.id === GLOBAL_ENV_ID) ?? null;
  const userEnvs = allEnvs.filter((e) => e.id !== GLOBAL_ENV_ID);

  const [selectedEnvId, setSelectedEnvId] = useState<string>(GLOBAL_ENV_ID);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const selectedEnv = allEnvs.find((e) => e.id === selectedEnvId) ?? globalEnv;

  const reloadConfig = useCallback(async () => {
    const fresh = await window.api.getConfig();
    await onConfigChange(fresh);
  }, [onConfigChange]);

  const handleAdd = async () => {
    const newEnv = await window.api.addEnvironment({ name: "New Environment", variables: [] });
    await reloadConfig();
    if (newEnv?.id) setSelectedEnvId(newEnv.id);
  };

  const handleSave = useCallback(async (updated: Environment) => {
    await window.api.updateEnvironment(updated);
    await reloadConfig();
    onAfterSave?.();
  }, [reloadConfig, onAfterSave]);

  const handleDelete = useCallback(async (id: string) => {
    const ok = await confirm("Delete this environment? All variables will be lost.");
    if (!ok) return;
    await window.api.deleteEnvironment(id);
    setSelectedEnvId(GLOBAL_ENV_ID);
    await reloadConfig();
  }, [reloadConfig, confirm]);

  const handleActivate = useCallback(async (id: string) => {
    await window.api.setActiveEnvironment(id);
    await reloadConfig();
  }, [reloadConfig]);

  const sidebar = (
    <div className="flex flex-col flex-1 overflow-hidden">
      <SidebarHeader onCollapse={() => setSidebarOpen(false)}>
        <span className="text-xs font-semibold text-text-dim uppercase tracking-wider px-1">{strings.environments.title}</span>
      </SidebarHeader>

      <div className="flex flex-col flex-1 overflow-y-auto">
        {/* Global always at top */}
        {globalEnv && (
          <EnvItem
            env={globalEnv}
            isActive={false}
            isSelected={selectedEnvId === GLOBAL_ENV_ID}
            isGlobal={true}
            onClick={() => setSelectedEnvId(GLOBAL_ENV_ID)}
          />
        )}

        {userEnvs.length > 0 && (
          <div className="border-t border-border/40 my-1" />
        )}

        {userEnvs.map((env) => (
          <EnvItem
            key={env.id}
            env={env}
            isActive={env.id === activeId}
            isSelected={selectedEnvId === env.id}
            isGlobal={false}
            onClick={() => setSelectedEnvId(env.id)}
          />
        ))}
      </div>

      {/* New env button at bottom */}
      <div className="flex-shrink-0 border-t border-border/40 p-2">
        <Button variant="secondary" icon={<Plus size={12} />} onClick={handleAdd} className="w-full justify-center">
          {strings.environments.newEnvironment}
        </Button>
      </div>
    </div>
  );

  const content = selectedEnv ? (
    <VariableEditor
      key={selectedEnv.id}
      env={selectedEnv}
      isActive={selectedEnv.id === activeId}
      isGlobal={selectedEnv.id === GLOBAL_ENV_ID}
      onSave={handleSave}
      onDelete={() => handleDelete(selectedEnv.id)}
      onActivate={() => handleActivate(selectedEnv.id)}
      onHistory={onHistoryOpen ? () => onHistoryOpen(`environments/${selectedEnv.id}.json`) : undefined}
    />
  ) : (
    <div className="flex flex-col flex-1 items-center justify-center">
      <EmptyState
        fill
        icon={<Globe size={36} />}
        title={strings.environments.noEnvironments}
        description={
          <>
            {strings.environments.noEnvironmentsDesc}{" "}
            {strings.environments.useVarPrefix} <code className="font-mono bg-bg3 px-1 rounded">{"{{VAR}}"}</code> {strings.environments.useVarSuffix}
          </>
        }
      />
    </div>
  );

  return (
    <>
      <SidebarLayout
        sidebarOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(true)}
        sidebar={sidebar}
        storageKey="environments-panel-sidebar"
      >
        {content}
      </SidebarLayout>
      {ConfirmDialogElement}
    </>
  );
}
