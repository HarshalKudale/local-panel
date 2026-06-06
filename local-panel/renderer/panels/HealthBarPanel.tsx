import React, { useState, useEffect, useCallback, useRef } from "react";
import { AppConfig, Environment, HealthBarService } from "@/types";
import Modal from "@/components/common/Modal";
import Toggle from "@/components/common/Toggle"; import PanelHeader from "@/components/layout/PanelHeader";
import { resolveVars } from "@/lib/resolveVars";
import { Button, IconButton, Input, FormField, EmptyState, Badge, StatusDot, ModalFooter } from "@/components/ui";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

import { Plus, RefreshCw, Activity, Trash2, Cloud, CheckCircle2, AlertCircle, X } from "@/lib/icons";
import { strings } from "@/lib/strings";

// ── Types ──────────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  ok: boolean;
  statusCode: number | null;
  body: string | null;
  headers: Record<string, string> | null;
  error: string | null;
  durationMs: number;
}

type CheckStatus = "idle" | "checking" | "success" | "error";

interface ServiceState {
  status: CheckStatus;
  statusCode: number | null;
  body: string | null;
  headers: Record<string, string> | null;
  error: string | null;
  durationMs: number | null;
  checkedAt: number | null;
}

interface FormState {
  name: string;
  url: string;
}

const EMPTY_FORM: FormState = { name: "", url: "" };

interface Props {
  config: AppConfig;
  entitySyncStatus: Record<string, "clean" | "modified" | "new" | "deleted">;
  onPublish: () => Promise<void>;
  onAfterSave?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusColor(s: CheckStatus, code: number | null): "green" | "red" | "yellow" | "dim" {
  if (s === "idle") return "dim";
  if (s === "checking") return "yellow";
  if (s === "error") return "red";
  if (code !== null && code >= 200 && code < 300) return "green";
  return "red";
}

function cardBorderClass(s: CheckStatus, code: number | null): string {
  if (s === "idle") return "border-border";
  if (s === "checking") return "border-yellow/40";
  if (s === "error") return "border-red/40";
  if (code !== null && code >= 200 && code < 300) return "border-green/40";
  return "border-red/40";
}

function cardBgClass(s: CheckStatus, code: number | null): string {
  if (s === "idle") return "";
  if (s === "checking") return "bg-yellow/5";
  if (s === "error") return "bg-red/5";
  if (code !== null && code >= 200 && code < 300) return "bg-green/5";
  return "bg-red/5";
}

function statusLabel(s: CheckStatus, code: number | null, error: string | null): string {
  if (s === "idle") return strings.healthBar.notChecked;
  if (s === "checking") return strings.healthBar.checking;
  if (s === "error") return error ?? strings.healthBar.error;
  if (code !== null) return `${code}`;
  return strings.healthBar.unknown;
}

function badgeVariant(s: CheckStatus, code: number | null): "green" | "red" | "yellow" | "neutral" {
  if (s === "idle") return "neutral";
  if (s === "checking") return "yellow";
  if (s === "error") return "red";
  if (code !== null && code >= 200 && code < 300) return "green";
  return "red";
}

function formatTs(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function tryFormatJson(text: string | null): string {
  if (!text) return "";
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

// ── Response Modal ─────────────────────────────────────────────────────────

function ResponseModal({
  open,
  service,
  state,
  onClose,
}: {
  open: boolean;
  service: HealthBarService | null;
  state: ServiceState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !service || !state) return null;

  const isSuccess = state.status === "success" && state.statusCode !== null && state.statusCode >= 200 && state.statusCode < 300;
  const isError = state.status === "error" || (state.statusCode !== null && state.statusCode >= 300);

  const hasHeaders = state.headers && Object.keys(state.headers).length > 0;
  const hasBody = state.body !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg1 border border-border rounded-lg shadow-2xl flex flex-col w-full max-w-5xl h-[70%] overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0">
          <StatusDot color={isSuccess ? "green" : isError ? "red" : "dim"} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-bright">{service.name}</p>
            <p className="text-xs text-text-dim font-mono truncate mt-0.5">{service.url}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {state.statusCode !== null && (
              <Badge variant={isSuccess ? "green" : "red"}>{state.statusCode}</Badge>
            )}
            {state.durationMs !== null && (
              <span className="text-xs text-text-dim">{state.durationMs}ms</span>
            )}
            {state.checkedAt !== null && (
              <span className="text-xs text-text-dim">· {formatTs(state.checkedAt)}</span>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-bg3 text-text-dim hover:text-text-base transition-colors cursor-pointer ml-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Error banner ── */}
        {state.error && (
          <div className="px-6 py-3 bg-red/5 border-b border-red/20 text-xs text-red font-mono break-all flex-shrink-0">
            {state.error}
          </div>
        )}

        {/* ── Split body ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Left — Response Headers */}
          <div className="w-80 flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 bg-bg0/30 flex-shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                Response Headers
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {hasHeaders ? (
                Object.entries(state.headers!).map(([k, v]) => (
                  <div key={k} className="border-b border-border/20 last:border-0 px-4 py-2 hover:bg-bg2/30">
                    <p className="text-[11px] font-mono text-accent truncate">{k}</p>
                    <p className="text-[11px] font-mono text-text-dim break-all mt-0.5">{String(v)}</p>
                  </div>
                ))
              ) : (
                <p className="px-4 py-4 text-xs text-text-dim italic">{strings.common.noHeaders}</p>
              )}
            </div>
          </div>

          {/* Right — Response Body */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 bg-bg0/30 flex-shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                Response Body
              </span>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {hasBody ? (
                <pre className="text-xs text-text-dim font-mono whitespace-pre-wrap break-all leading-relaxed">
                  {tryFormatJson(state.body)}
                </pre>
              ) : (
                <p className="text-xs text-text-dim italic">No body</p>
              )}
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end px-6 py-3 border-t border-border flex-shrink-0">
          <Button variant="secondary" onClick={onClose}>{strings.common.close}</Button>
        </div>

      </div>
    </div>
  );
}

// ── Service Card ───────────────────────────────────────────────────────────

function ServiceCard({
  service,
  state,
  resolvedUrl,
  onRefresh,
  onToggleAutoRefresh,
  onDelete,
  onClick,
}: {
  service: HealthBarService;
  state: ServiceState;
  resolvedUrl: string;
  onRefresh: () => void;
  onToggleAutoRefresh: (enabled: boolean) => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  const dot = statusColor(state.status, state.statusCode);
  const border = cardBorderClass(state.status, state.statusCode);
  const bg = cardBgClass(state.status, state.statusCode);
  const label = statusLabel(state.status, state.statusCode, state.error);
  const bv = badgeVariant(state.status, state.statusCode);

  return (
    <div
      className={`rounded-lg border ${border} ${bg} overflow-hidden transition-all`}
    >
      {/* Clickable body */}
      <button
        className="w-full text-left p-4 cursor-pointer hover:bg-bg2/30 transition-colors"
        onClick={onClick}
        title={strings.healthBar.viewLastResponse}
      >
        <div className="flex items-start gap-3">
          <StatusDot
            color={dot}
            pulse={state.status === "checking"}
            size="md"
            className="mt-0.5 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-bright truncate">{service.name}</p>
            <p className="text-xs text-text-dim font-mono truncate mt-0.5" title={resolvedUrl}>
              {resolvedUrl || service.url}
            </p>
          </div>
          <Badge variant={bv} className="flex-shrink-0 mt-0.5">
            {label}
          </Badge>
        </div>

        {/* Timing + timestamp */}
        {(state.durationMs !== null || state.checkedAt !== null) && (
          <div className="flex items-center gap-3 mt-2.5 pl-7">
            {state.durationMs !== null && (
              <span className="text-xs text-text-dim">{state.durationMs}ms</span>
            )}
            {state.checkedAt !== null && (
              <span className="text-xs text-text-dim">
                {strings.healthBar.lastChecked} {formatTs(state.checkedAt)}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Footer controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-border/40 bg-bg0/20">
        <span className="text-xs text-text-dim flex-shrink-0">{strings.healthBar.autoRefresh}</span>
        <Toggle checked={service.autoRefreshEnabled} onChange={onToggleAutoRefresh} />
        <div className="flex-1" />
        <IconButton
          icon={<RefreshCw size={13} className={state.status === "checking" ? "animate-spin" : ""} />}
          title={strings.healthBar.refreshService}
          onClick={(e) => { e.stopPropagation(); onRefresh(); }}
          disabled={state.status === "checking"}
        />
        <IconButton
          icon={<Trash2 size={13} />}
          title={strings.healthBar.removeService}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="hover:border-red/40 hover:text-red"
        />
      </div>
    </div>
  );
}

// ── Add / Edit Modal ───────────────────────────────────────────────────────

function AddServiceModal({
  open,
  editingService,
  onClose,
  onSave,
}: {
  open: boolean;
  editingService: HealthBarService | null;
  onClose: () => void;
  onSave: (name: string, url: string) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<FormState>>({});

  useEffect(() => {
    if (open) {
      setForm(editingService ? { name: editingService.name, url: editingService.url } : EMPTY_FORM);
      setErrors({});
    }
  }, [open, editingService]);

  const validate = (): boolean => {
    const errs: Partial<FormState> = {};
    if (!form.name.trim()) errs.name = strings.healthBar.nameRequired;
    if (!form.url.trim()) {
      errs.url = strings.healthBar.urlRequired;
    } else {
      // Allow env var tokens {{VAR}} — validate after stripping them
      const stripped = form.url.replace(/\{\{[^}]+\}\}/g, "placeholder");
      try { new URL(stripped); } catch {
        errs.url = strings.healthBar.urlInvalid;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form.name.trim(), form.url.trim());
  };

  return (
    <Modal open={open} title={editingService ? strings.healthBar.editService : strings.healthBar.addService} onClose={onClose}>
      <FormField label={strings.healthBar.serviceName} error={errors.name}>
        <Input
          className="w-full"
          placeholder="e.g. Auth Service"
          value={form.name}
          error={!!errors.name}
          autoFocus
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
      </FormField>
      <FormField label={strings.healthBar.healthCheckUrl} error={errors.url}>
        <Input
          className="w-full font-mono"
          placeholder="http://localhost:3000/health or http://{{HOST}}/health"
          value={form.url}
          error={!!errors.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
        <p className="text-xs text-text-dim mt-1">
          {strings.healthBar.supportsEnvVars} <code className="text-accent">{"{{VAR_NAME}}"}</code>
        </p>
      </FormField>
      <ModalFooter
        onCancel={onClose}
        onConfirm={handleSave}
        confirmLabel={editingService ? strings.healthBar.update : strings.healthBar.addService}
      />
    </Modal>
  );
}

// ── HealthBarPanel ─────────────────────────────────────────────────────────

let _hbid = 0;
const mkHbId = () => `hb${Date.now().toString(36)}${(++_hbid).toString(36)}`;

export default function HealthBarPanel({ config, entitySyncStatus, onPublish, onAfterSave }: Props) {
  const wsId = config.activeWorkspaceId;

  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  // Active environment for env var resolution
  const activeEnv: Environment | null =
    (config.environments ?? []).find((e) => e.id === config.activeEnvironmentId) ?? null;

  const [services, setServices] = useState<HealthBarService[]>([]);
  const [checkStates, setCheckStates] = useState<Record<string, ServiceState>>({});
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<HealthBarService | null>(null);
  const [responseModal, setResponseModal] = useState<{ service: HealthBarService; state: ServiceState } | null>(null);
  const [publishing, setPublishing] = useState(false);


  // Track in-flight checks to avoid duplicate concurrent calls
  const inflightRef = useRef<Set<string>>(new Set());

  // Derived
  const SERVICES_REL_PATH = "healthbar/services.json";
  const syncStatus = entitySyncStatus[SERVICES_REL_PATH];
  const publishDisabled = syncStatus === "clean" || publishing;
  const publishTooltip = syncStatus === "clean" ? strings.healthBar.synced : undefined;

  // ── Load services on mount / workspace change ────────────────────────────

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const svcs: HealthBarService[] = await window.api.healthbarGetServices(wsId);
      setServices(svcs);
      return svcs;
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  // ── Persist services ─────────────────────────────────────────────────────

  const persistServices = useCallback(async (svcs: HealthBarService[]) => {
    await window.api.healthbarSaveServices(wsId, svcs);
    onAfterSave?.();
  }, [wsId, onAfterSave]);

  // ── Check a single service ───────────────────────────────────────────────

  const checkService = useCallback(async (svc: HealthBarService) => {
    if (inflightRef.current.has(svc.id)) return;
    inflightRef.current.add(svc.id);

    const resolvedUrl = resolveVars(svc.url, activeEnv);

    setCheckStates((prev) => ({
      ...prev,
      [svc.id]: {
        ...(prev[svc.id] ?? { statusCode: null, body: null, headers: null, error: null, durationMs: null, checkedAt: null }),
        status: "checking",
      },
    }));

    try {
      const result: HealthCheckResult = await window.api.healthbarCheckUrl(resolvedUrl);
      const isOk = result.ok && result.statusCode !== null && result.statusCode >= 200 && result.statusCode < 300;
      setCheckStates((prev) => ({
        ...prev,
        [svc.id]: {
          status: isOk ? "success" : "error",
          statusCode: result.statusCode,
          body: result.body,
          headers: result.headers,
          error: result.error,
          durationMs: result.durationMs,
          checkedAt: Date.now(),
        },
      }));
    } catch (err: any) {
      setCheckStates((prev) => ({
        ...prev,
        [svc.id]: {
          status: "error",
          statusCode: null,
          body: null,
          headers: null,
          error: err?.message ?? "Check failed",
          durationMs: null,
          checkedAt: Date.now(),
        },
      }));
    } finally {
      inflightRef.current.delete(svc.id);
    }
  }, [activeEnv]);

  // ── Check all services ───────────────────────────────────────────────────

  const checkAll = useCallback((svcs: HealthBarService[]) => {
    for (const svc of svcs) checkService(svc);
  }, [checkService]);

  // ── Mount effect ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadServices().then((svcs) => {
      const autoRefreshSvcs = svcs.filter((s) => s.autoRefreshEnabled);
      if (autoRefreshSvcs.length > 0) checkAll(autoRefreshSvcs);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  // ── Add / Edit ───────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setEditingService(null);
    setAddModalOpen(true);
  };

  const handleSaveService = async (name: string, url: string) => {
    let updated: HealthBarService[];
    if (editingService) {
      updated = services.map((s) =>
        s.id === editingService.id ? { ...s, name, url } : s
      );
    } else {
      const newSvc: HealthBarService = {
        id: mkHbId(),
        name,
        url,
        autoRefreshEnabled: true,
        createdAt: Date.now(),
      };
      updated = [...services, newSvc];
    }
    setServices(updated);
    setAddModalOpen(false);
    setEditingService(null);
    await persistServices(updated);
    // Check new or edited service
    if (!editingService) {
      const newSvc = updated[updated.length - 1];
      checkService(newSvc);
    } else {
      const svc = updated.find((s) => s.id === editingService.id);
      if (svc) checkService(svc);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: string) => {
    const ok = await confirm("Delete this service? This cannot be undone.");
    if (!ok) return;
    const updated = services.filter((s) => s.id !== id);
    setServices(updated);
    setCheckStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await persistServices(updated);
  }, [confirm, services, persistServices]);

  // ── Toggle auto-refresh ───────────────────────────────────────────────────

  const handleToggleAutoRefresh = useCallback(async (id: string, enabled: boolean) => {
    const updated = services.map((s) => s.id === id ? { ...s, autoRefreshEnabled: enabled } : s);
    setServices(updated);
    await persistServices(updated);
  }, [services, persistServices]);

  // ── Publish ───────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await onPublish();
    } finally {
      setPublishing(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const anyChecking = Object.values(checkStates).some((s) => s.status === "checking");

  const headerActions = (
    <>
      {/* Publish button */}
      <span title={publishTooltip}>
        <Button
          variant="secondary"
          icon={<Cloud size={13} />}
          disabled={publishDisabled}
          onClick={handlePublish}
        >
          {publishing ? strings.healthBar.publishing : strings.healthBar.publish}
        </Button>
      </span>

      {/* Refresh all */}
      <Button
        variant="secondary"
        icon={<RefreshCw size={13} className={anyChecking ? "animate-spin" : ""} />}
        disabled={anyChecking || services.length === 0}
        onClick={() => checkAll(services)}
      >
        {strings.healthBar.refreshAll}
      </Button>

      {/* Add service */}
      <Button variant="primary" icon={<Plus size={13} />} onClick={handleOpenAdd}>
        {strings.healthBar.addService}
      </Button>
    </>
  );

  const defaultState: ServiceState = {
    status: "idle",
    statusCode: null,
    body: null,
    headers: null,
    error: null,
    durationMs: null,
    checkedAt: null,
  };

  return (
    <>
      {ConfirmDialogElement}
      <div className="flex flex-col flex-1 overflow-hidden">
        <PanelHeader
          title={strings.healthBar.title}
          subtitle={
            services.length > 0
              ? `${services.length} ${services.length !== 1 ? strings.healthBar.services : strings.healthBar.service}`
              : undefined
          }
          actions={headerActions}
        />

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-32 text-text-dim text-sm">
              {strings.healthBar.loadingServices}
            </div>
          )}

          {!loading && services.length === 0 && (
            <EmptyState
              fill
              icon={<Activity size={40} />}
              title={strings.healthBar.noServices}
              description={strings.healthBar.noServicesDesc}
              action={
                <Button variant="primary" icon={<Plus size={13} />} onClick={handleOpenAdd}>
                  {strings.healthBar.addService}
                </Button>
              }
            />
          )}

          {!loading && services.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {services.map((svc) => {
                const state = checkStates[svc.id] ?? defaultState;
                const resolvedUrl = resolveVars(svc.url, activeEnv);
                return (
                  <ServiceCard
                    key={svc.id}
                    service={svc}
                    state={state}
                    resolvedUrl={resolvedUrl}
                    onRefresh={() => checkService(svc)}
                    onToggleAutoRefresh={(enabled) => handleToggleAutoRefresh(svc.id, enabled)}
                    onDelete={() => handleDelete(svc.id)}
                    onClick={() => {
                      if (state.status !== "idle") {
                        setResponseModal({ service: svc, state });
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Add / Edit modal */}
        <AddServiceModal
          open={addModalOpen}
          editingService={editingService}
          onClose={() => { setAddModalOpen(false); setEditingService(null); }}
          onSave={handleSaveService}
        />

        {/* Response modal */}
        <ResponseModal
          open={!!responseModal}
          service={responseModal?.service ?? null}
          state={responseModal?.state ?? null}
          onClose={() => setResponseModal(null)}
        />
      </div>
    </>
  );
}
