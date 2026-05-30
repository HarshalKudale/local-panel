import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } from "electron";
import * as path from "path";
import * as dotenv from "dotenv";
// Load .env before anything else so SUPABASE_* are available
dotenv.config({ path: path.join(__dirname, "..", ".env") });
import { processSpawner } from "@/applications/processSpawner";
import { registerIpcHandlers } from "@/ipc/handlers";
import { loadConfig, generateId } from "@/store/config";
import { loadSettings, saveSettings } from "@/store/appSettings";
import { initWorkspaceDir, dataRoot, wsDir } from "@/store/workspaceFs";
import { startServer, stopServer } from "@/proxy/server";
import { startCompanionServer, stopCompanionServer } from "@/companion/companionServer";
import { checkGitInstalled, initWorkspaceRepo } from "@/store/gitStore";
import { startAutoSync, stopAllAutoSync, setAutoSyncReloadFn } from "@/sync/autoSync";
import { getSyncConfig } from "@/sync/syncManager";
import * as fs from "fs";


app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-gpu");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

function getAppIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(path.join(__dirname, "..", "icon.png"));
}

function createTray(): void {
  tray = new Tray(getAppIcon());
  tray.setToolTip("Local Panel");
  updateTrayMenu();

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function updateTrayMenu(): void {
  if (!tray) return;
  const cfg = loadConfig();
  const menu = Menu.buildFromTemplate([
    {
      label: "Open Local Panel",
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createWindow();
      },
    },
    { type: "separator" },
    {
      label: "Minimize to Tray on Close",
      type: "checkbox",
      checked: cfg.minimizeToTray,
      click: (item) => {
        const current = loadConfig();
        const { saveConfig } = require("@/store/config");
        saveConfig({ ...current, minimizeToTray: item.checked });
        updateTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 720,
    minWidth: 1400,
    minHeight: 720,
    title: "Local Panel",
    icon: getAppIcon(),
    backgroundColor: "#121212",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#121212",
      symbolColor: "#71736d",
      height: 35,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
  mainWindow.once("ready-to-show", () => mainWindow!.show());

  processSpawner.setMainWindow(mainWindow);

  mainWindow.on("close", (e) => {
    if (!quitting && loadConfig().minimizeToTray) {
      e.preventDefault();
      mainWindow!.hide();
    }
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  const hasGit = await checkGitInstalled();
  if (!hasGit) {
    dialog.showErrorBox(
      "Git required",
      "Local Panel requires Git to be installed for config versioning and sync.\n\nPlease install Git from https://git-scm.com and restart.",
    );
    app.quit();
    return;
  }

  let settings = loadSettings();

  // Init dirs/repos for all known workspaces first
  for (const ws of settings.workspaces) {
    initWorkspaceDir(ws.id, ws.name);
    await initWorkspaceRepo(ws.id);
    const syncCfg = getSyncConfig(ws.id);
    if (syncCfg?.autoSync) startAutoSync(ws.id);
  }

  // Validate active workspace — fallback or create new if its dir is missing
  const wsDirExists = (id: string) => {
    try { return fs.statSync(wsDir(id)).isDirectory(); } catch { return false; }
  };
  if (!wsDirExists(settings.activeWorkspaceId)) {
    const valid = settings.workspaces.find((w) => wsDirExists(w.id));
    if (valid) {
      settings.activeWorkspaceId = valid.id;
      saveSettings(settings);
    } else {
      // No valid workspace on disk — create a fresh empty one
      const id = generateId();
      const name = "Workspace 1";
      settings.workspaces = [{ id, name, activeEnvironmentId: null }];
      settings.activeWorkspaceId = id;
      saveSettings(settings);
      initWorkspaceDir(id, name);
      await initWorkspaceRepo(id);
    }
  }

  const { reloadConfig } = require("@/proxy/server");
  setAutoSyncReloadFn(reloadConfig);

  registerIpcHandlers();

  // First-launch IPC
  ipcMain.handle("app:isFirstLaunch", () => {
    const s = loadSettings();
    return !s.hasSeenWelcome;
  });
  ipcMain.handle("app:completeFirstLaunch", () => {
    const s = loadSettings();
    saveSettings({ ...s, hasSeenWelcome: true });
    return { ok: true };
  });

  // Handle second instance on Windows
  app.on("second-instance", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  createWindow();
  createTray();

  const cfg = loadConfig();
  startServer(cfg.port);
  startCompanionServer(cfg.companionPort ?? 9271);
});

app.on("before-quit", () => {
  quitting = true;
  processSpawner.stopAll();
  stopAllAutoSync();
  stopCompanionServer();
  stopServer();
});


app.on("window-all-closed", () => {
  // Don't quit on window close — tray keeps app alive
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
  else { mainWindow.show(); mainWindow.focus(); }
});
