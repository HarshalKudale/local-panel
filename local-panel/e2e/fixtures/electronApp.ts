import { test as base, expect, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import path from "path";
import fs from "fs";
import os from "os";
import { writeSampleWorkspace } from "./sampleData";

export interface ElectronFixtures {
    electronApp: ElectronApplication;
    page: Page;
    userData: string;
}

/**
 * Custom Playwright fixture that launches the Electron app with an isolated userData dir.
 * Each test gets a fresh data directory to avoid state leakage.
 * The workspace is pre-populated with sample data for realistic screenshots and tests.
 */
export const test = base.extend<ElectronFixtures>({
    userData: async ({ }, use) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-e2e-"));

        // Pre-populate with sample workspace data
        // App expects: ${LOCALAPPDATA}/Local Panel/app.json and ${LOCALAPPDATA}/Local Panel/data/
        const appDir = path.join(dir, "Local Panel");
        const dataDir = path.join(appDir, "data");
        fs.mkdirSync(dataDir, { recursive: true });
        writeSampleWorkspace(dataDir);

        await use(dir);
        // Cleanup after test
        fs.rmSync(dir, { recursive: true, force: true });
    },

    electronApp: async ({ userData }, use) => {
        const appPath = path.resolve(__dirname, "..", "..");
        const app = await electron.launch({
            args: [appPath],
            env: {
                ...process.env,
                NODE_ENV: "test",
                LOCALAPPDATA: userData, // Override where settings/data are stored on Windows
                XDG_CONFIG_HOME: userData, // Linux
                HOME: userData, // macOS/Linux fallback
                LP_E2E: "1",
            },
        });
        await use(app);
        await app.close();
    },

    page: async ({ electronApp }, use) => {
        const window = await electronApp.firstWindow();
        // Wait for the app to be fully loaded
        await window.waitForLoadState("domcontentloaded");
        await use(window);
    },
});

export { expect };
