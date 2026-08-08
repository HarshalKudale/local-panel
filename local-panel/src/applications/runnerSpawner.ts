/**
 * Runner Spawner — manages running script/command processes.
 * Reads pre-computed command from disk and spawns it.
 */

import { ChildProcess, spawn } from "child_process";
import { BrowserWindow } from "electron";
import { readEntity } from "@/store/workspaceFs";
import {
    RunnerConfig,
    RunnerProcessState,
    RunnerProcessStatus,
    RunnerLogChunk,
} from "./runnerTypes";

interface RunningProcess {
    proc: ChildProcess;
    state: RunnerProcessState;
    logBuffer: RunnerLogChunk[];
}

const MAX_LOG_LINES = 5000;

class RunnerSpawner {
    private processes: Map<string, RunningProcess> = new Map();
    private mainWindow: BrowserWindow | null = null;

    setMainWindow(win: BrowserWindow): void {
        this.mainWindow = win;
    }

    start(wsId: string, runnerId: string): RunnerProcessState {
        if (this.processes.has(runnerId)) {
            this.stop(runnerId);
        }

        const config = readEntity<RunnerConfig>(wsId, "runners", runnerId);
        if (!config) {
            const errorState: RunnerProcessState = {
                runnerId,
                status: "error",
                error: `Runner config not found: ${runnerId}`,
            };
            this.sendToRenderer("runner:statusChange", errorState);
            return errorState;
        }

        const command = config.resolvedCommand;
        if (!command || !command.trim()) {
            const errorState: RunnerProcessState = {
                runnerId,
                status: "error",
                error: "No command to run. Save the configuration to generate the command.",
            };
            this.sendToRenderer("runner:statusChange", errorState);
            return errorState;
        }

        const cwd = config.resolvedCwd || config.workingDirectory || process.cwd();
        const env = { ...process.env, ...(config.resolvedEnv || {}) };

        const state: RunnerProcessState = {
            runnerId,
            status: "starting",
            startedAt: Date.now(),
        };

        const logBuffer: RunnerLogChunk[] = [];

        this.emitLog(runnerId, logBuffer, "system", `> ${command}\n`);
        this.emitLog(runnerId, logBuffer, "system", `  cwd: ${cwd}\n\n`);

        const proc = spawn(command, [], {
            cwd,
            env,
            shell: true,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        const pid = proc.pid ?? 0;
        state.pid = pid;
        state.status = "running";

        const entry: RunningProcess = { proc, state, logBuffer };
        this.processes.set(runnerId, entry);

        proc.stdout?.on("data", (data: Buffer) => {
            this.emitLog(runnerId, entry.logBuffer, "stdout", data.toString());
        });

        proc.stderr?.on("data", (data: Buffer) => {
            this.emitLog(runnerId, entry.logBuffer, "stderr", data.toString());
        });

        proc.on("error", (err) => {
            this.emitLog(runnerId, entry.logBuffer, "system", `\n[ERROR] ${err.message}\n`);
            entry.state.status = "error";
            entry.state.error = err.message;
            this.sendToRenderer("runner:statusChange", { runnerId, status: "error", error: err.message });
        });

        proc.on("exit", (code, signal) => {
            const exitMsg = signal
                ? `\n[Process terminated by signal ${signal}]\n`
                : `\n[Process exited with code ${code}]\n`;
            this.emitLog(runnerId, entry.logBuffer, "system", exitMsg);
            entry.state.status = "exited";
            entry.state.exitCode = code;
            entry.state.stoppedAt = Date.now();
            this.sendToRenderer("runner:statusChange", {
                runnerId,
                status: "exited",
                exitCode: code,
                pid: entry.state.pid,
            });
        });

        this.sendToRenderer("runner:statusChange", { runnerId, status: "running", pid, startedAt: state.startedAt });

        return state;
    }

    stop(runnerId: string): void {
        const entry = this.processes.get(runnerId);
        if (!entry) return;

        entry.state.status = "stopping";
        this.sendToRenderer("runner:statusChange", { runnerId, status: "stopping" });

        try {
            if (process.platform === "win32") {
                spawn("taskkill", ["/T", "/F", "/PID", String(entry.proc.pid)], { shell: false });
            } else {
                entry.proc.kill("SIGTERM");
                setTimeout(() => {
                    try { entry.proc.kill("SIGKILL"); } catch { }
                }, 5000);
            }
        } catch { }
    }

    getState(runnerId: string): RunnerProcessState {
        const entry = this.processes.get(runnerId);
        if (!entry) return { runnerId, status: "idle" };
        return entry.state;
    }

    getAllStates(): RunnerProcessState[] {
        return Array.from(this.processes.values()).map((e) => e.state);
    }

    getLogs(runnerId: string): RunnerLogChunk[] {
        return this.processes.get(runnerId)?.logBuffer ?? [];
    }

    private emitLog(
        runnerId: string,
        buffer: RunnerLogChunk[],
        stream: "stdout" | "stderr" | "system",
        data: string,
    ): void {
        const chunk: RunnerLogChunk = { runnerId, stream, data, ts: Date.now() };
        buffer.push(chunk);
        if (buffer.length > MAX_LOG_LINES) buffer.splice(0, buffer.length - MAX_LOG_LINES);
        this.sendToRenderer("runner:log", chunk);
    }

    private sendToRenderer(channel: string, data: unknown): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

export const runnerSpawner = new RunnerSpawner();
