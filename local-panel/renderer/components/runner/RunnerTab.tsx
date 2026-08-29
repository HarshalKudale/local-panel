import React, { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { Button, Badge, Input } from "@/components/ui";
import { Play, Square, RefreshCw, ChevronDown, ChevronRight, FolderSearch2, Loader2 } from "@/lib/icons";
import { strings } from "@/lib/strings";
import { RUNNER_TYPES, RUNNER_TYPE_LABELS, RUNNER_TYPE_ICONS } from "@/lib/runnerUtils";
import RunnerTypeFields from "./RunnerTypeFields";
import XtermLogViewer from "./XtermLogViewer";
import type { RunnerConfig, RunnerProcessState } from "@/types";

interface Props {
    runnerId: string;
    workspaceId: string;
    initial?: Partial<RunnerConfig>;
    onSaved: (runner: RunnerConfig, fromTabId: string) => void;
    onDelete: (id: string) => void;
    onDirtyChange?: (dirty: boolean) => void;
}

export interface RunnerTabHandle {
    save(): void;
}

const DRAFT_ID_PREFIX = "runner-draft-";

function isDraft(id: string) {
    return id.startsWith(DRAFT_ID_PREFIX);
}

// Stable key for dirty comparison — only the user-editable fields
function runnerKey(r: Partial<RunnerConfig>): string {
    return JSON.stringify({
        name: r.name ?? "",
        type: r.type ?? "command",
        workingDirectory: r.workingDirectory ?? "",
        args: r.args ?? "",
        preRunCommand: r.preRunCommand ?? "",
        command: r.command,
        shellConfig: r.shellConfig,
        batConfig: r.batConfig,
        nodeConfig: r.nodeConfig,
        npmConfig: r.npmConfig,
        pythonConfig: r.pythonConfig,
        dockerConfig: r.dockerConfig,
        dockerComposeConfig: r.dockerComposeConfig,
    });
}

// -- Type picker dropdown ---------------------------------------------------

interface TypePickerProps {
    value: string;
    options: typeof RUNNER_TYPES;
    onChange: (type: string) => void;
}

function TypePicker({ value, options, onChange }: TypePickerProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const currentType = value as keyof typeof RUNNER_TYPE_LABELS;
    const Icon = RUNNER_TYPE_ICONS[currentType] ?? RUNNER_TYPE_ICONS["command"];
    const label = RUNNER_TYPE_LABELS[currentType] ?? value;

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const categories = Array.from(new Set(options.map((t) => t.category)));

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2 h-full px-3 py-2 bg-bg2 border border-border hover:border-accent rounded text-sm text-text-base transition-colors min-w-[140px] select-none"
            >
                <Icon size={14} className="text-accent flex-shrink-0" />
                <span className="flex-1 text-left text-text-bright">{label}</span>
                <ChevronDown size={11} className="text-text-dim flex-shrink-0" />
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-bg1 border border-border rounded shadow-lg py-1 min-w-[180px]">
                    {categories.map((cat) => (
                        <div key={cat}>
                            <div className="px-3 py-1 text-[10px] font-semibold text-text-dim uppercase tracking-wider">
                                {cat}
                            </div>
                            {options.filter((t) => t.category === cat).map((t) => {
                                const TIcon = RUNNER_TYPE_ICONS[t.type as keyof typeof RUNNER_TYPE_ICONS];
                                const isSelected = t.type === value;
                                return (
                                    <button
                                        key={t.type}
                                        type="button"
                                        onClick={() => { onChange(t.type); setOpen(false); }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors hover:bg-bg2 ${isSelected ? "text-accent" : "text-text-base"}`}
                                    >
                                        <TIcon size={13} className={isSelected ? "text-accent" : "text-text-dim"} />
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// -- Field row for 2-col grid -----------------------------------------------

function FieldRow({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
    return (
        <div className={full ? "col-span-2" : ""}>
            <label className="block text-[11px] font-medium text-text-dim mb-1">{label}</label>
            {children}
        </div>
    );
}

// -- Main component ---------------------------------------------------------

const RunnerTab = forwardRef<RunnerTabHandle, Props>(function RunnerTab({ runnerId, workspaceId, initial, onSaved, onDelete, onDirtyChange }: Props, ref) {
    const s = strings.runner;
    const isNew = isDraft(runnerId);

    const initialState = useMemo<Partial<RunnerConfig>>(() => ({
        name: "",
        type: "command",
        workingDirectory: "",
        args: "",
        preRunCommand: "",
        ...initial,
        workspaceId,
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    const [runner, setRunner] = useState<Partial<RunnerConfig>>(initialState);
    const savedSnapshot = useRef(runnerKey(initialState));

    // If initial was undefined at mount (runners not yet loaded), reinitialize once it arrives
    const hadNoInitialRef = useRef(initial === undefined && !isNew);
    useEffect(() => {
        if (hadNoInitialRef.current && initial !== undefined) {
            hadNoInitialRef.current = false;
            const merged: Partial<RunnerConfig> = {
                name: "", type: "command", workingDirectory: "", args: "", preRunCommand: "",
                ...initial,
                workspaceId,
            };
            setRunner(merged);
            savedSnapshot.current = runnerKey(merged);
        }
    }, [initial, workspaceId]);
    const [configOpen, setConfigOpen] = useState(true);
    const [saving, setSaving] = useState(false);
    const [processState, setProcessState] = useState<RunnerProcessState | null>(null);
    const unsubRef = useRef<(() => void) | null>(null);

    // Dirty detection
    const isDirty = runnerKey(runner) !== savedSnapshot.current;
    useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

    useEffect(() => {
        if (isNew) return;
        window.api.getRunnerState(runnerId).then((s: RunnerProcessState) => {
            if (s) setProcessState(s);
        }).catch(() => {});

        const unsub = window.api.onRunnerStatusChange((data: unknown) => {
            const state = data as RunnerProcessState;
            if (state.runnerId === runnerId) setProcessState(state);
        });
        unsubRef.current = unsub;
        return () => { unsubRef.current?.(); };
    }, [runnerId, isNew]);

    const handleChange = useCallback((partial: Partial<RunnerConfig>) => {
        setRunner((prev) => ({ ...prev, ...partial }));
    }, []);

    const handleSave = useCallback(async () => {
        if (!runner.name?.trim()) return;
        setSaving(true);
        try {
            const toSave: Partial<RunnerConfig> = {
                ...runner,
                workspaceId,
                resolvedCommand: "",
                resolvedCwd: runner.workingDirectory || ".",
                resolvedEnv: {},
            };
            if (!isNew) toSave.id = runnerId;
            const saved = await window.api.saveRunner(toSave) as RunnerConfig;
            savedSnapshot.current = runnerKey(runner);
            onSaved(saved, runnerId);
            setConfigOpen(false);
        } finally {
            setSaving(false);
        }
    }, [runner, workspaceId, runnerId, isNew, onSaved]);

    useImperativeHandle(ref, () => ({
        save() {
            void handleSave();
        },
    }), [handleSave]);

    const handleRun = useCallback(async () => {
        if (isNew) return;
        setProcessState((p) => p ? { ...p, status: "starting" } : { runnerId, status: "starting" });
        await window.api.startRunner(workspaceId, runnerId);
    }, [runnerId, workspaceId, isNew]);

    const handleStop = useCallback(async () => {
        setProcessState((p) => p ? { ...p, status: "stopping" } : null);
        await window.api.stopRunner(runnerId);
    }, [runnerId]);

    const handleRestart = useCallback(async () => {
        await window.api.stopRunner(runnerId);
        setTimeout(() => window.api.startRunner(workspaceId, runnerId), 300);
    }, [runnerId, workspaceId]);

    const handlePickFolder = useCallback(async () => {
        const p = await window.api.pickFolderPath(s.browseFolder);
        if (p) handleChange({ workingDirectory: p });
    }, [handleChange, s.browseFolder]);

    const status = processState?.status ?? "idle";
    const isRunning = status === "running";
    const isStarting = status === "starting";
    const isStopping = status === "stopping";
    const isActive = isRunning || isStarting || isStopping;

    const platform = (window.api as any).platform ?? "linux";
    const availableTypes = RUNNER_TYPES.filter((t) => !t.windowsOnly || platform === "win32");

    const canSave = !!runner.name?.trim() && !saving && (isNew || isDirty);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Header bar ─────────────────────────────────────────────── */}
            <div className="flex-shrink-0 border-b border-border bg-bg0">
                {/* Title row: collapse chevron + type picker + name + run controls */}
                <div className="flex items-center gap-2 px-3 py-2">
                    {/* Collapse/expand chevron */}
                    <button
                        type="button"
                        title={configOpen ? s.configCollapse : s.configExpand}
                        onClick={() => setConfigOpen((o) => !o)}
                        className="flex-shrink-0 text-text-dim hover:text-text-base transition-colors p-0.5"
                    >
                        {configOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    <TypePicker
                        value={runner.type ?? "command"}
                        options={availableTypes}
                        onChange={(t) => handleChange({ type: t as any })}
                    />

                    <Input
                        value={runner.name ?? ""}
                        onChange={(e) => handleChange({ name: e.target.value })}
                        placeholder={s.newRunner}
                        autoFocus={isNew}
                        className="flex-1 font-medium"
                        onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    />

                    {/* Run controls */}
                    {!isNew && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            {(isStarting || isStopping) && (
                                <span className="flex items-center gap-1 text-xs text-text-dim">
                                    <Loader2 size={11} className="animate-spin" />
                                    {isStarting ? s.statusStarting : s.statusStopping}
                                </span>
                            )}
                            {status === "error" && <Badge variant="red">{s.statusError}</Badge>}
                            {isRunning && <Badge variant="green">{s.statusRunning}</Badge>}
                            <Button
                                variant={isRunning ? "ghost" : "primary"}
                                size="sm"
                                icon={isActive ? (isStopping ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />) : <Play size={12} />}
                                onClick={isActive ? handleStop : handleRun}
                                disabled={isStarting || isStopping}
                            >
                                {isActive ? s.actionStop : s.actionRun}
                            </Button>
                            {isRunning && (
                                <Button variant="ghost" size="sm" icon={<RefreshCw size={12} />} onClick={handleRestart} />
                            )}
                        </div>
                    )}
                </div>

                {/* ── Collapsible config form ───────────────────────────── */}
                {configOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/50">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {/* Working directory — full width */}
                            <FieldRow label={s.labelWorkingDirectory} full>
                                <div className="flex gap-1">
                                    <Input
                                        value={runner.workingDirectory ?? ""}
                                        onChange={(e) => handleChange({ workingDirectory: e.target.value })}
                                        placeholder="."
                                        className="flex-1"
                                        inputSize="sm"
                                    />
                                    <Button variant="secondary" size="sm" icon={<FolderSearch2 size={12} />} onClick={handlePickFolder}>
                                        {s.browse}
                                    </Button>
                                </div>
                            </FieldRow>

                            {/* Type-specific fields injected here */}
                            <RunnerTypeFields runner={runner} onChange={handleChange} />

                            {/* Arguments */}
                            <FieldRow label={s.labelArguments}>
                                <Input
                                    value={runner.args ?? ""}
                                    onChange={(e) => handleChange({ args: e.target.value })}
                                    placeholder={s.hintOptional}
                                    inputSize="sm"
                                />
                            </FieldRow>

                            {/* Pre-run command */}
                            <FieldRow label={s.labelPreRunCommand}>
                                <Input
                                    value={runner.preRunCommand ?? ""}
                                    onChange={(e) => handleChange({ preRunCommand: e.target.value })}
                                    placeholder={s.hintPreRunCommand}
                                    inputSize="sm"
                                />
                            </FieldRow>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-3 pt-2 border-t border-border/50">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSave}
                                disabled={!canSave}
                            >
                                {s.saveRunner}
                            </Button>
                            {!isNew && (
                                <Button variant="ghost" size="sm" onClick={() => setConfigOpen(false)}>
                                    {s.cancelEdit}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Terminal ───────────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {isNew ? (
                    <div className="flex items-center justify-center h-full text-text-dim text-sm">
                        {s.terminalNoOutput}
                    </div>
                ) : (
                    <XtermLogViewer runnerId={runnerId} />
                )}
            </div>
        </div>
    );
});

export default RunnerTab;
