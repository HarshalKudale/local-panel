/**
 * IPC handlers for runner configurations and process management.
 */

import { ipcMain } from "electron";
import { readAllEntities, writeEntity, deleteEntityFile } from "@/store/workspaceFs";
import { runnerSpawner } from "@/applications/runnerSpawner";
import { generateRunnerCommand } from "@/applications/runnerCommandGenerator";
import type { RunnerConfig } from "@/applications/runnerTypes";

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function registerRunnerHandlers(): void {
    ipcMain.handle("runners:list", (_e, wsId: string) => {
        return readAllEntities(wsId, "runners");
    });

    ipcMain.handle("runners:save", (_e, runner: RunnerConfig) => {
        if (!runner.id) {
            runner.id = generateId();
            runner.createdAt = Date.now();
        }
        const resolved = generateRunnerCommand(runner, process.platform);
        const configToSave: RunnerConfig = { ...runner, ...resolved };
        writeEntity(configToSave.workspaceId, "runners", configToSave.id, configToSave);
        return configToSave;
    });

    ipcMain.handle("runners:delete", (_e, wsId: string, id: string) => {
        runnerSpawner.stop(id);
        deleteEntityFile(wsId, "runners", id);
        return { ok: true };
    });

    ipcMain.handle("runners:start", (_e, wsId: string, runnerId: string) => {
        return runnerSpawner.start(wsId, runnerId);
    });

    ipcMain.handle("runners:stop", (_e, runnerId: string) => {
        runnerSpawner.stop(runnerId);
        return { ok: true };
    });

    ipcMain.handle("runners:getState", (_e, runnerId: string) => {
        return runnerSpawner.getState(runnerId);
    });

    ipcMain.handle("runners:getAllStates", () => {
        return runnerSpawner.getAllStates();
    });

    ipcMain.handle("runners:getLogs", (_e, runnerId: string) => {
        return runnerSpawner.getLogs(runnerId);
    });
}
