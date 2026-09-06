/**
 * CollectionRunner -- split-panel runner tab.
 * Left: request list (always visible, drag-to-reorder).
 * Right: live results panel with per-request cards.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Play, Square, ChevronDown, ChevronUp, GripVertical, CheckCircle2, XCircle, Loader2, AlertTriangle, Terminal, Download } from "lucide-react";
import { SavedRequest, Environment } from "@/types";
import { runCollection, CollectionRunReport, RunnerRequestResult } from "@/lib/collectionRunner";
import { statusColor } from "@/lib/utils";
import { strings } from "@/lib/strings";

export interface CollectionRunnerProps {
    folderId: string;
    folderName: string;
    requests: SavedRequest[];
    activeEnv: Environment | null;
    wsId: string;
    onClose(): void;
    onSaveReport?(report: CollectionRunReport): Promise<void>;
}

export default function CollectionRunner({
    folderId,
    folderName,
    requests,
    activeEnv,
    wsId,
    onClose,
    onSaveReport,
}: CollectionRunnerProps) {
    const [orderedRequests, setOrderedRequests] = useState<SavedRequest[]>(requests);
    const [delayMs, setDelayMs] = useState(0);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<RunnerRequestResult[]>([]);
    const [report, setReport] = useState<CollectionRunReport | null>(null);
    const [configLoaded, setConfigLoaded] = useState(false);
    const cancelledRef = useRef(false);
    const dragIndexRef = useRef<number | null>(null);
    const dragOverRef = useRef<number | null>(null);

    // Load runner.json config on mount
    useEffect(() => {
        (async () => {
            try {
                const cfg = await window.api.loadRunnerConfig(wsId, folderId);
                if (cfg) {
                    setDelayMs(cfg.delayMs ?? 0);
                    if (cfg.requestOrder?.length) {
                        const orderMap = new Map(cfg.requestOrder.map((id, idx) => [id, idx]));
                        const sorted = [...requests].sort((a, b) => {
                            const ai = orderMap.get(a.id) ?? 9999;
                            const bi = orderMap.get(b.id) ?? 9999;
                            return ai - bi;
                        });
                        setOrderedRequests(sorted);
                    }
                }
            } catch { /* ignore */ }
            setConfigLoaded(true);
        })();
    }, [wsId, folderId]);

    // Sync when requests added/removed from folder
    useEffect(() => {
        if (!configLoaded) return;
        const currentIds = new Set(orderedRequests.map((r) => r.id));
        const newReqs = requests.filter((r) => !currentIds.has(r.id));
        const validOrdered = orderedRequests.filter((r) => requests.some((x) => x.id === r.id));
        if (newReqs.length > 0 || validOrdered.length !== orderedRequests.length) {
            setOrderedRequests([...validOrdered, ...newReqs]);
        }
    }, [requests, configLoaded]);

    const saveConfig = useCallback(async (reqs: SavedRequest[], delay: number) => {
        try {
            await window.api.saveRunnerConfig(wsId, folderId, {
                requestOrder: reqs.map((r) => r.id),
                delayMs: delay,
            });
        } catch { /* ignore */ }
    }, [wsId, folderId]);

    const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
        setOrderedRequests((prev) => {
            const next = [...prev];
            const [item] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, item);
            saveConfig(next, delayMs);
            return next;
        });
    }, [delayMs, saveConfig]);

    const handleDelayChange = useCallback((val: number) => {
        setDelayMs(val);
        saveConfig(orderedRequests, val);
    }, [orderedRequests, saveConfig]);

    const moveUp = useCallback((idx: number) => { if (idx > 0) handleReorder(idx, idx - 1); }, [handleReorder]);
    const moveDown = useCallback((idx: number) => { if (idx < orderedRequests.length - 1) handleReorder(idx, idx + 1); }, [handleReorder, orderedRequests.length]);

    const handleRun = useCallback(async () => {
        if (orderedRequests.length === 0) return;
        cancelledRef.current = false;
        setRunning(true);
        setResults([]);
        setProgress(0);
        setReport(null);

        // Load full entities (stubs from config don't include scripts/body)
        const fullRequests: SavedRequest[] = await Promise.all(
            orderedRequests.map(async (stub) => {
                try {
                    const res = await window.api.loadEntity(wsId, "requests", stub.id);
                    if (res.ok && res.entity) return res.entity as SavedRequest;
                } catch { /* fall through */ }
                return stub;
            }),
        );

        const runReport = await runCollection(
            fullRequests,
            activeEnv,
            folderId,
            folderName,
            {
                onRequestStart(index) { setProgress(index); },
                onRequestDone(index, result) {
                    setResults((prev) => [...prev, result]);
                    setProgress(index + 1);
                },
                isCancelled() { return cancelledRef.current; },
            },
            delayMs,
        );

        setRunning(false);
        setReport(runReport);
        onSaveReport?.(runReport);
    }, [orderedRequests, activeEnv, folderId, folderName, onSaveReport, delayMs, wsId]);

    const handleCancel = useCallback(() => { cancelledRef.current = true; }, []);

    const handleExport = useCallback(async () => {
        if (!report) return;
        await window.api.exportRunnerReport(report);
    }, [report]);

    // Drag-and-drop
    const handleDragStart = useCallback((idx: number) => { dragIndexRef.current = idx; }, []);
    const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        dragOverRef.current = idx;
    }, []);
    const handleDrop = useCallback((idx: number) => {
        const from = dragIndexRef.current;
        if (from !== null && from !== idx) handleReorder(from, idx);
        dragIndexRef.current = null;
        dragOverRef.current = null;
    }, [handleReorder]);

    const totalTests = results.reduce((acc, r) => acc + r.tests.length, 0);
    const passedTests = results.reduce((acc, r) => acc + r.tests.filter((t) => t.passed).length, 0);
    const failedTests = totalTests - passedTests;
    const allGood = failedTests === 0 && results.every((r) => !r.error);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Top toolbar */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background/60 flex-shrink-0">
                <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-foreground">{folderName}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{strings.collectionRunner.requestCount.replace("{count}", String(orderedRequests.length)).replace("{s}", orderedRequests.length !== 1 ? "s" : "")}</span>
                </div>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {strings.collectionRunner.delay}
                    <input
                        type="number"
                        min={0}
                        step={100}
                        value={delayMs}
                        onChange={(e) => handleDelayChange(Math.max(0, Number(e.target.value)))}
                        disabled={running}
                        className="w-16 px-1.5 py-0.5 rounded bg-card border border-border/60 text-foreground text-[10px] font-mono text-center focus:outline-none focus:border-signal/60"
                    />
                    <span>{strings.collectionRunner.ms}</span>
                </label>
                {report && !running && (
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border/60 hover:border-signal/50 text-muted-foreground hover:text-foreground text-xs cursor-pointer transition-colors"
                        title={strings.collectionRunner.exportTitle}
                    >
                        <Download size={12} /> {strings.common.export}
                    </button>
                )}
                {!running ? (
                    <button
                        onClick={handleRun}
                        disabled={orderedRequests.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-signal hover:bg-signal/80 text-background text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Play size={12} />
                        {report ? strings.collectionRunner.runAgain : strings.collectionRunner.run}
                    </button>
                ) : (
                    <button
                        onClick={handleCancel}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-destructive/15 hover:bg-destructive/25 text-destructive text-xs font-semibold cursor-pointer border border-destructive/30 transition-colors"
                    >
                        <Square size={12} /> {strings.common.cancel}
                    </button>
                )}
            </div>

            {/* Progress bar (while running) */}
            {running && (
                <div className="px-4 py-1.5 border-b border-border/40 bg-background/30 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Loader2 size={10} className="animate-spin text-signal" />
                        <span className="text-[10px] text-muted-foreground">{strings.collectionRunner.running}</span>
                        <span className="text-[10px] text-foreground font-mono">{progress}/{orderedRequests.length}</span>
                    </div>
                    <div className="w-full h-1 bg-card rounded overflow-hidden">
                        <div
                            className="h-full bg-signal transition-all duration-300"
                            style={{ width: `${(progress / Math.max(orderedRequests.length, 1)) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Summary bar (after run) */}
            {report && !running && (
                <div className="flex items-center gap-5 px-4 py-1.5 border-b border-border/40 bg-background/30 flex-shrink-0">
                    {allGood ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-signal">
                            <CheckCircle2 size={13} /> {strings.collectionRunner.allPassed}
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive">
                            <XCircle size={13} /> {strings.collectionRunner.someFailed}
                        </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                        <span className="text-foreground font-mono">{results.length}</span> {strings.collectionRunner.requests}
                    </span>
                    {totalTests > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                            <span className="text-signal font-mono">{passedTests}</span>
                            {failedTests > 0 && <><span className="text-muted-foreground mx-1">/</span><span className="text-destructive font-mono">{failedTests} {strings.collectionRunner.failed}</span></>}
                            {" "}{strings.collectionRunner.tests}
                        </span>
                    )}
                    <span className="text-[11px] text-muted-foreground ml-auto font-mono">
                        {((report.completedAt - report.startedAt) / 1000).toFixed(2)}s
                    </span>
                </div>
            )}

            {/* Split body */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left panel -- request list */}
                <div className="w-72 flex-shrink-0 border-r border-border/60 flex flex-col overflow-hidden bg-background/20">
                    <div className="px-3 py-2 border-b border-border/30 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{strings.collectionRunner.requestsHeader}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">{strings.collectionRunner.dragToReorder}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {orderedRequests.length === 0 && (
                            <div className="flex items-center justify-center h-20">
                                <p className="text-[11px] text-muted-foreground">{strings.collectionRunner.noRequests}</p>
                            </div>
                        )}
                        {orderedRequests.map((req, idx) => {
                            const result = results[idx];
                            const isRunning = running && idx === progress;
                            return (
                                <div
                                    key={req.id}
                                    draggable={!running}
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={(e) => handleDragOver(e, idx)}
                                    onDrop={() => handleDrop(idx)}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded border border-border/30 bg-surface/20 hover:bg-surface/50 cursor-grab active:cursor-grabbing group select-none"
                                >
                                    <GripVertical size={12} className="text-muted-foreground/40 flex-shrink-0" />
                                    <span className="text-[10px] text-muted-foreground/60 w-4 text-right font-mono flex-shrink-0">{idx + 1}</span>
                                    <span className={`text-[10px] font-bold font-mono w-11 flex-shrink-0 ${methodColor(req.method)}`}>
                                        {req.method}
                                    </span>
                                    <span className="text-[11px] text-foreground truncate flex-1" title={req.name || req.url}>
                                        {req.name || strings.collectionRunner.untitled}
                                    </span>
                                    {isRunning && (
                                        <Loader2 size={11} className="animate-spin text-signal flex-shrink-0" />
                                    )}
                                    {result && <StatusDot result={result} />}
                                    {!result && !isRunning && (
                                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
                                            <button onClick={() => moveUp(idx)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer p-0.5">
                                                <ChevronUp size={11} />
                                            </button>
                                            <button onClick={() => moveDown(idx)} disabled={idx === orderedRequests.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer p-0.5">
                                                <ChevronDown size={11} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right panel -- results */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {results.length === 0 && !running ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
                            <Play size={36} className="opacity-10 text-foreground" />
                            <p className="text-xs text-muted-foreground max-w-48">
                                {strings.collectionRunner.pressRunPrefix} <span className="font-semibold text-foreground">{strings.collectionRunner.run}</span> {strings.collectionRunner.pressRunSuffix}
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {results.map((r, i) => (
                                <RequestResultCard key={i} result={r} index={i} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Small colored dot shown on left-panel rows after running */
function StatusDot({ result }: { result: RunnerRequestResult }) {
    const hasError = !!result.error;
    const hasTests = result.tests.length > 0;
    const allPassed = result.tests.every((t) => t.passed);
    const isGood = !hasError && (!hasTests ? (result.status !== null && result.status >= 200 && result.status < 300) : allPassed);
    return isGood
        ? <CheckCircle2 size={13} className="text-signal flex-shrink-0" />
        : <XCircle size={13} className="text-destructive flex-shrink-0" />;
}

function methodColor(method: string): string {
    switch (method.toUpperCase()) {
        case "GET": return "text-signal";
        case "POST": return "text-amber";
        case "PUT": return "text-blue";
        case "PATCH": return "text-orange";
        case "DELETE": return "text-destructive";
        default: return "text-signal";
    }
}

function getResultCardStyle(result: RunnerRequestResult): { border: string; bg: string; indicator: string } {
    const hasError = !!result.error;
    const hasTests = result.tests.length > 0;
    const allPassed = result.tests.every((t) => t.passed);
    if (hasError || (hasTests && !allPassed)) return { border: "border-destructive/25", bg: "bg-destructive/5", indicator: "bg-destructive" };
    if (hasTests && allPassed) return { border: "border-signal/25", bg: "bg-signal/5", indicator: "bg-signal" };
    if (result.status !== null && result.status >= 200 && result.status < 300) return { border: "border-signal/25", bg: "bg-signal/5", indicator: "bg-signal" };
    if (result.status !== null && result.status >= 400) return { border: "border-destructive/25", bg: "bg-destructive/5", indicator: "bg-destructive" };
    return { border: "border-border/40", bg: "bg-surface/20", indicator: "bg-amber" };
}

function RequestResultCard({ result, index }: { result: RunnerRequestResult; index: number }) {
    const hasExpandable = result.tests.length > 0 || !!result.error || !!result.preScriptError || !!result.postScriptError || result.testLogs.length > 0;
    const [expanded, setExpanded] = useState(false);
    const hasTests = result.tests.length > 0;
    const allPassed = result.tests.every((t) => t.passed);
    const style = getResultCardStyle(result);

    return (
        <div className={`rounded-md border ${style.border} ${style.bg} overflow-hidden`}>
            {/* Card header row */}
            <div
                className={`flex items-center gap-2.5 px-3 py-2 ${hasExpandable ? "cursor-pointer hover:bg-black/10" : ""}`}
                onClick={() => hasExpandable && setExpanded((v) => !v)}
            >
                {/* Status indicator bar */}
                <span className={`w-0.5 h-5 rounded-full flex-shrink-0 ${style.indicator}`} />

                <span className="text-[10px] font-mono text-muted-foreground w-4 text-right flex-shrink-0">{index + 1}</span>
                <span className={`text-[10px] font-bold font-mono w-12 flex-shrink-0 ${methodColor(result.method)}`}>{result.method}</span>

                <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-foreground font-medium truncate">{result.requestName}</div>
                    <div className="text-[10px] text-muted-foreground/70 truncate font-mono">{result.url}</div>
                </div>

                {/* Status code */}
                {result.status !== null ? (
                    <span className="text-xs font-bold font-mono flex-shrink-0" style={{ color: statusColor(result.status) }}>
                        {result.status}
                    </span>
                ) : (
                    result.error && <span className="text-[10px] text-destructive flex-shrink-0">{strings.collectionRunner.error}</span>
                )}

                {/* Response time */}
                <span className="text-[10px] text-muted-foreground/70 font-mono flex-shrink-0">{result.responseTime}ms</span>

                {/* Test summary badge */}
                {hasTests && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${allPassed ? "bg-signal/15 text-signal" : "bg-destructive/15 text-destructive"}`}>
                        {result.tests.filter((t) => t.passed).length}/{result.tests.length}
                    </span>
                )}

                {hasExpandable && (
                    expanded ? <ChevronUp size={13} className="text-muted-foreground/50 flex-shrink-0" /> : <ChevronDown size={13} className="text-muted-foreground/50 flex-shrink-0" />
                )}
            </div>

            {/* Expanded details */}
            {expanded && hasExpandable && (
                <div className="border-t border-border/25 px-3 py-2 space-y-2">
                    {/* Errors */}
                    {result.error && (
                        <div className="flex items-start gap-1.5 text-[11px] text-destructive font-mono bg-destructive/5 rounded px-2 py-1">
                            <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                            {result.error}
                        </div>
                    )}
                    {result.preScriptError && (
                        <div className="text-[11px] text-amber font-mono bg-amber/5 rounded px-2 py-1">
                            <span className="text-muted-foreground mr-1">{strings.collectionRunner.preScriptLabel}</span>{result.preScriptError}
                        </div>
                    )}
                    {result.postScriptError && (
                        <div className="text-[11px] text-amber font-mono bg-amber/5 rounded px-2 py-1">
                            <span className="text-muted-foreground mr-1">{strings.collectionRunner.postScriptLabel}</span>{result.postScriptError}
                        </div>
                    )}

                    {/* Test results */}
                    {result.tests.length > 0 && (
                        <div className="space-y-0.5">
                            {result.tests.map((t, ti) => (
                                <div key={ti} className={`flex items-start gap-2 text-[11px] font-mono py-0.5 ${t.passed ? "text-signal" : "text-destructive"}`}>
                                    {t.passed
                                        ? <CheckCircle2 size={12} className="flex-shrink-0 mt-px" />
                                        : <XCircle size={12} className="flex-shrink-0 mt-px" />
                                    }
                                    <span className="flex-1">{t.name}</span>
                                    {t.error && <span className="text-[10px] opacity-70 truncate max-w-48" title={t.error}>{t.error}</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Console logs */}
                    {result.testLogs.length > 0 && (
                        <div className="border-t border-border/20 pt-2 space-y-0.5">
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
                                <Terminal size={9} /> {strings.collectionRunner.console}
                            </div>
                            {result.testLogs.map((log, li) => (
                                <div key={li} className="text-[10px] text-muted-foreground font-mono">{log}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
