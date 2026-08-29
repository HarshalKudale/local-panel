import React, { useState, useEffect, useMemo } from "react";
import { AppConfig } from "@/types";
import { strings } from "@/lib/strings";
import iconUrl from "@/icon.png";
import { Theme } from "@/lib/useTheme";
import { allThemes, darkThemes, lightThemes, getThemeById } from "@/lib/themes";
import { Button, Input, SectionLabel, SectionCard, Select, SettingsRow, Switch } from "@/components/ui";
import PanelLayout from "@/components/ui/PanelLayout";
import { Panel, enabledPanels, ALWAYS_VISIBLE_PANELS, PanelEntry } from "@/lib/panelRegistry";
import { ChevronDown, ChevronRight, Star, Heart } from "@/lib/icons";

interface Props {
  config: AppConfig;
  serverRunning: boolean;
  serverError: string | null;
  onConfigChange: (cfg: AppConfig) => Promise<void>;
  onServerRestart: () => Promise<void>;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  sidebarVisibility: Record<string, boolean>;
  onSidebarVisibilityChange: (id: string, visible: boolean) => void;
}

export default function SettingsPanel({ config, serverRunning, serverError, onConfigChange, onServerRestart, theme, onThemeChange, sidebarVisibility, onSidebarVisibilityChange }: Props) {
  const [portInput, setPortInput] = useState(String(config.port));
  const [webhookPortInput, setWebhookPortInput] = useState(String(config.webhookPort ?? 9101));
  const [companionPortInput, setCompanionPortInput] = useState(String(config.companionPort ?? 9271));
  const [restarting, setRestarting] = useState(false);
  const [tlsImporting, setTlsImporting] = useState<"cert" | "key" | null>(null);
  const [tlsGenerating, setTlsGenerating] = useState(false);
  const [tlsInstalling, setTlsInstalling] = useState(false);
  const [tlsInstallResult, setTlsInstallResult] = useState<{ ok: boolean; needsManualInstall?: boolean; instructions?: string; error?: string } | null>(null);

  useEffect(() => {
    setPortInput(String(config.port));
    setWebhookPortInput(String(config.webhookPort ?? 9101));
    setCompanionPortInput(String(config.companionPort ?? 9271));
  }, [config.port, config.webhookPort, config.companionPort]);

  const handlePortCommit = () => {
    const port = parseInt(portInput, 10);
    if (port >= 1 && port <= 65535) {
      if (port !== config.port) {
        handleGlobalChange({ port });
      }
    } else {
      setPortInput(String(config.port));
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await onServerRestart();
    } finally {
      setRestarting(false);
    }
  };

  const handleGlobalChange = (patch: Partial<Pick<typeof config, "port" | "minimizeToTray" | "webhookPort" | "companionPort" | "tlsEnabled" | "tlsCaCertPath" | "tlsCaKeyPath">>) => {
    onConfigChange({ ...config, ...patch });
  };

  const hasCert = !!config.tlsCaCertPath;
  const hasKey = !!config.tlsCaKeyPath;
  const tlsReady = hasCert && hasKey;

  const handleImportCert = async () => {
    setTlsImporting("cert");
    try {
      const result = await window.api.tlsImportCert();
      if (result.ok && result.path) {
        handleGlobalChange({ tlsCaCertPath: result.path });
      }
    } finally {
      setTlsImporting(null);
    }
  };

  const handleImportKey = async () => {
    setTlsImporting("key");
    try {
      const result = await window.api.tlsImportKey();
      if (result.ok && result.path) {
        handleGlobalChange({ tlsCaKeyPath: result.path });
      }
    } finally {
      setTlsImporting(null);
    }
  };

  const handleRemoveCert = async () => {
    await window.api.tlsRemoveCert();
    setTlsInstallResult(null);
    handleGlobalChange({ tlsEnabled: false, tlsCaCertPath: null, tlsCaKeyPath: null });
  };

  const handleGenerateCert = async () => {
    setTlsGenerating(true);
    setTlsInstallResult(null);
    try {
      const result = await window.api.tlsGenerate();
      if (result.ok && result.certPath && result.keyPath) {
        handleGlobalChange({ tlsCaCertPath: result.certPath, tlsCaKeyPath: result.keyPath });
      }
    } finally {
      setTlsGenerating(false);
    }
  };

  const handleInstallCA = async () => {
    setTlsInstalling(true);
    setTlsInstallResult(null);
    try {
      const result = await window.api.tlsInstallCA();
      setTlsInstallResult(result);
    } finally {
      setTlsInstalling(false);
    }
  };

  const handleExportCert = async () => {
    await window.api.tlsExportCert();
  };

  const handleWebhookPortCommit = () => {
    const port = parseInt(webhookPortInput, 10);
    if (port >= 1 && port <= 65535) {
      if (port !== (config.webhookPort ?? 9101)) {
        handleGlobalChange({ webhookPort: port });
      }
    } else {
      setWebhookPortInput(String(config.webhookPort ?? 9101));
    }
  };

  const handleCompanionPortCommit = () => {
    const port = parseInt(companionPortInput, 10);
    if (port >= 1 && port <= 65535) {
      if (port !== (config.companionPort ?? 9271)) {
        handleGlobalChange({ companionPort: port });
      }
    } else {
      setCompanionPortInput(String(config.companionPort ?? 9271));
    }
  };

  const portHint = config.port === 80 ? "example.localhost" : `example.localhost:${config.port}`;

  return (
    <PanelLayout title={strings.settings.title} subtitle={strings.settings.subtitle}>
      <div className="flex flex-col gap-6">

        {/* -- Server section ------------------------------------------- */}
        <section>
          <SectionLabel>{strings.settings.sectionServer}</SectionLabel>

          {serverError ? (
            <div className="mb-3 px-3 py-2 rounded border border-red/30 bg-red/5 text-xs text-red flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red flex-shrink-0 mt-0.5" />
              <span className="flex-1">{strings.server.error.replace("{error}", serverError)}</span>
            </div>
          ) : (
            <div className="mb-3 px-3 py-2 rounded border border-green/20 bg-green/5 text-xs text-green flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green flex-shrink-0" style={{ boxShadow: "0 0 6px var(--c-green)" }} />
              {serverRunning
                ? strings.server.running.replace("{port}", String(config.port)).replace("{hint}", portHint)
                : strings.server.notRunning}
            </div>
          )}

          <div className="mb-3 p-4 rounded border border-accent/20 bg-accent/5 text-xs text-text-dim leading-relaxed flex flex-col gap-2">
            <p>
              <span className="text-accent font-semibold">{strings.settings.port80Hint}</span>
              {" "}Use <code className="font-mono bg-bg3 px-1 py-0.5 rounded text-text-bright">{strings.settings.port80Example}</code> — browsers resolve <code className="font-mono bg-bg3 px-1 py-0.5 rounded text-text-bright">*.localhost</code> to 127.0.0.1 automatically (RFC 6761).
            </p>
            <p>
              <span className="text-accent font-semibold">{strings.settings.otherPortHint}</span>
              {" "}Use <code className="font-mono bg-bg3 px-1 py-0.5 rounded text-text-bright">{portHint}</code> in the browser. No proxy setup needed.
            </p>
            <p>
              <span className="text-accent font-semibold">{strings.settings.proxyHint}</span>
              {" "}Optionally set <code className="font-mono bg-bg3 px-1 py-0.5 rounded text-text-bright">127.0.0.1:{config.port}</code> as your HTTP proxy. Proxy rules then apply to all HTTP traffic.{" "}
              {config.tlsEnabled
                ? strings.settings.httpsIntercepted
                : strings.settings.httpsTunnel}
            </p>
          </div>

          <SectionCard>
            <SettingsRow
              title={strings.settings.serverPort}
              desc={strings.settings.serverPortDesc.replace("{hint}", portHint)}
            >
              <Input
                aria-label={strings.settings.serverPort}
                type="number"
                className="w-24 text-right font-mono"
                min={1}
                max={65535}
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                onBlur={handlePortCommit}
                onKeyDown={(e) => { if (e.key === "Enter") handlePortCommit(); }}
              />
            </SettingsRow>

            <SettingsRow
              title={strings.settings.webhookServerPort}
              desc={`${strings.settings.webhookServerPortDesc} ${strings.settings.currentlyLabel} localhost:${config.webhookPort ?? 9101}/localpanel/webhooks/`}
            >
              <Input
                aria-label={strings.settings.webhookServerPort}
                type="number"
                className="w-24 text-right font-mono"
                min={1}
                max={65535}
                value={webhookPortInput}
                onChange={(e) => setWebhookPortInput(e.target.value)}
                onBlur={handleWebhookPortCommit}
                onKeyDown={(e) => { if (e.key === "Enter") handleWebhookPortCommit(); }}
              />
            </SettingsRow>

            <SettingsRow
              title={strings.settings.companionPort}
              desc={strings.settings.companionPortDesc}
            >
              <Input
                aria-label={strings.settings.companionPort}
                type="number"
                className="w-24 text-right font-mono"
                min={1}
                max={65535}
                value={companionPortInput}
                onChange={(e) => setCompanionPortInput(e.target.value)}
                onBlur={handleCompanionPortCommit}
                onKeyDown={(e) => { if (e.key === "Enter") handleCompanionPortCommit(); }}
              />
            </SettingsRow>

            <SettingsRow
              title={strings.settings.minimizeToTray}
              desc={strings.settings.minimizeToTrayDesc}
            >
              <Switch
                checked={config.minimizeToTray}
                ariaLabel={strings.settings.minimizeToTray}
                onChange={(v) => handleGlobalChange({ minimizeToTray: v })}
              />
            </SettingsRow>

            <SettingsRow title={strings.settings.restartServer} desc={strings.settings.restartServerDesc}>
              <Button
                variant="secondary"
                onClick={handleRestart}
                disabled={restarting}
              >
                {restarting ? strings.server.restarting : strings.server.restart}
              </Button>
            </SettingsRow>

            <SettingsRow title={strings.settings.darkMode} desc={strings.settings.darkModeDesc}>
              <Select
                aria-label={strings.settings.darkMode}
                className="w-56"
                value={theme}
                onChange={(e) => onThemeChange(e.target.value)}
              >
                <optgroup label={strings.settings.themeGroupDark}>
                  {darkThemes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
                <optgroup label={strings.settings.themeGroupLight}>
                  {lightThemes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              </Select>
            </SettingsRow>
          </SectionCard>
        </section>

        {/* -- TLS Interception section --------------------------------- */}
        <section>
          <SectionLabel>{strings.settings.sectionTls}</SectionLabel>

          <div className="mb-3 p-4 rounded border border-accent/20 bg-accent/5 text-xs text-text-dim leading-relaxed">
            <p>{strings.settings.tlsGenerateHint}</p>
          </div>

          <SectionCard>
            {/* -- Generate --------------------------------------------- */}
            <SettingsRow
              title={strings.settings.tlsCaCert}
              desc={strings.settings.tlsCaCertDesc}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono truncate max-w-[160px] ${hasCert ? "text-green" : "text-text-dim"}`}>
                  {hasCert
                    ? config.tlsCaCertPath!.split(/[\\/]/).pop()
                    : strings.settings.tlsNotConfigured}
                </span>
                <Button
                  variant="primary"
                  onClick={handleGenerateCert}
                  disabled={tlsGenerating || tlsImporting !== null}
                >
                  {tlsGenerating ? strings.settings.tlsGenerating : strings.settings.tlsGenerate}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleImportCert}
                  disabled={tlsGenerating || tlsImporting !== null}
                >
                  {tlsImporting === "cert" ? "…" : strings.settings.tlsImport}
                </Button>
              </div>
            </SettingsRow>

            {/* -- Key import (only shown if using a custom/imported cert) -- */}
            <SettingsRow title={strings.settings.tlsCaKey} desc={strings.settings.tlsCaKeyDesc}>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono ${hasKey ? "text-green" : "text-text-dim"}`}>
                  {hasKey
                    ? config.tlsCaKeyPath!.split(/[\\/]/).pop()
                    : strings.settings.tlsNotConfigured}
                </span>
                <Button
                  variant="secondary"
                  onClick={handleImportKey}
                  disabled={tlsGenerating || tlsImporting !== null}
                >
                  {tlsImporting === "key" ? "…" : strings.settings.tlsImport}
                </Button>
              </div>
            </SettingsRow>

            {/* -- Install / Export / Remove - only when cert+key are ready -- */}
            {tlsReady && (
              <>
                <SettingsRow
                  title={strings.settings.tlsInstallCA}
                  desc={strings.settings.tlsInstallHint}
                >
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={handleInstallCA}
                        disabled={tlsInstalling}
                      >
                        {tlsInstalling ? strings.settings.tlsInstalling : strings.settings.tlsInstallCA}
                      </Button>
                      <Button variant="secondary" onClick={handleExportCert}>
                        {strings.settings.tlsExportCert}
                      </Button>
                      <Button variant="secondary" onClick={handleRemoveCert}>
                        {strings.settings.tlsRemove}
                      </Button>
                    </div>

                    {/* Install result feedback */}
                    {tlsInstallResult && (
                      <div className={`text-xs px-3 py-2 rounded border w-full ${tlsInstallResult.ok
                        ? "border-green/30 bg-green/5 text-green"
                        : "border-red/30 bg-red/5 text-red"
                        }`}>
                        {tlsInstallResult.ok
                          ? strings.settings.tlsInstallSuccess
                          : tlsInstallResult.needsManualInstall
                            ? (
                              <>
                                <p className="mb-1 font-medium">{strings.settings.tlsManualInstall}</p>
                                <pre className="font-mono text-[10px] whitespace-pre-wrap break-all text-text-dim">
                                  {tlsInstallResult.instructions}
                                </pre>
                              </>
                            )
                            : `${strings.settings.tlsInstallFailed}: ${tlsInstallResult.error}`
                        }
                      </div>
                    )}
                  </div>
                </SettingsRow>
              </>
            )}

            <SettingsRow title={strings.settings.tlsEnabled} desc={strings.settings.tlsEnabledDesc}>
              <Switch
                checked={config.tlsEnabled}
                ariaLabel={strings.settings.tlsEnabled}
                onChange={(v) => handleGlobalChange({ tlsEnabled: v })}
                disabled={!tlsReady}
              />
            </SettingsRow>
          </SectionCard>
        </section>

        {/* -- Appearance section --------------------------------------- */}
        <AppearanceSection
          sidebarVisibility={sidebarVisibility}
          onSidebarVisibilityChange={onSidebarVisibilityChange}
        />

        {/* -- About section -------------------------------------------- */}
        <section>
          <SectionLabel>{strings.settings.sectionAbout}</SectionLabel>

          <SectionCard>
            <div className="px-5 py-4 border-b border-border flex items-center gap-4">
              <img src={iconUrl} className="w-10 h-10 rounded-lg flex-shrink-0" alt={strings.titleBar.appName} />
              <div>
                <div className="text-sm font-semibold text-text-bright">{strings.titleBar.appName}</div>
                <div className="text-xs text-text-dim mt-0.5">{strings.settings.appDesc}</div>
              </div>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3 text-xs text-text-dim">
              <AboutRow label={strings.settings.version}>
                <span className="text-text-bright font-mono">{__APP_VERSION__}</span>
              </AboutRow>
              <AboutRow label={strings.settings.author}>
                <span className="text-text-bright">{strings.settings.authorName}</span>
              </AboutRow>
              <AboutRow label={strings.settings.github}>
                <a
                  href={strings.settings.githubUrl}
                  onClick={(e) => { e.preventDefault(); window.api.openExternal(strings.settings.githubUrl); }}
                  className="text-accent hover:underline font-mono cursor-pointer"
                >
                  {strings.settings.githubDisplay}
                </a>
              </AboutRow>
              <AboutRow label={strings.settings.license}>
                <span className="text-text-base">{strings.settings.licenseName}</span>
              </AboutRow>
            </div>
            <div className="px-5 py-4 border-t border-border flex flex-wrap gap-3">
              <button
                onClick={() => window.api.openExternal("https://github.com/HarshalKudale/local-panel")}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-40 border border-border text-xs font-medium text-text-base hover:border-accent/50 hover:text-accent transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 8 .2z" /></svg>
                <Star size={14} /> {strings.settings.starOnGitHub}
              </button>
              <button
                onClick={() => window.api.openExternal("https://github.com/HarshalKudale/local-panel/blob/main/SUPPORT.md")}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-40 border border-border text-xs font-medium text-text-base hover:border-accent/50 hover:text-accent transition-colors cursor-pointer"
              >
                <Heart size={14} /> {strings.settings.supportProject}
              </button>
            </div>
          </SectionCard>
        </section>

      </div>
    </PanelLayout>
  );
}

function AboutRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-text-base font-medium w-16 flex-shrink-0">{label}</span>
      {children}
    </div>
  );
}

// -- Appearance section (collapsible, grouped) -----------------------------

interface AppearanceSectionProps {
  sidebarVisibility: Record<string, boolean>;
  onSidebarVisibilityChange: (id: string, visible: boolean) => void;
}

function AppearanceSection({ sidebarVisibility, onSidebarVisibilityChange }: AppearanceSectionProps) {
  const [expanded, setExpanded] = useState(false);

  // Group panels by section, preserving order
  const groups = useMemo(() => {
    const map = new Map<string, PanelEntry[]>();
    for (const entry of enabledPanels) {
      const list = map.get(entry.section) ?? [];
      list.push(entry);
      map.set(entry.section, list);
    }
    return Array.from(map.entries()).map(([section, items]) => ({ section, items }));
  }, []);

  const visibleCount = enabledPanels.filter(
    (e) => ALWAYS_VISIBLE_PANELS.includes(e.id) || sidebarVisibility[e.id] !== false
  ).length;

  return (
    <section>
      <SectionLabel>{strings.settings.sectionAppearance}</SectionLabel>

      <SectionCard>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-4 px-5 py-4 w-full text-left cursor-pointer hover:bg-bg2 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-base">{strings.settings.sidebarPanels}</div>
            <div className="text-xs text-text-dim mt-0.5">
              {strings.settings.sidebarPanelsDesc} ({strings.settings.sidebarPanelsShown.replace("{visibleCount}", String(visibleCount)).replace("{n}", String(enabledPanels.length))})
            </div>
          </div>
          <span className="flex-shrink-0 text-text-dim">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>

        {expanded && (
          <div className="border-t border-border">
            {groups.map(({ section, items }) => (
              <div key={section}>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-text-dim px-5 pt-3 pb-1">
                  {section}
                </div>
                {items.map((entry) => {
                  const isAlwaysVisible = ALWAYS_VISIBLE_PANELS.includes(entry.id);
                  const isVisible = isAlwaysVisible || sidebarVisibility[entry.id] !== false;
                  return (
                    <div key={entry.id} className="flex items-center gap-4 px-5 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-base">{entry.label}</div>
                        {isAlwaysVisible && (
                          <div className="text-[10px] text-text-dim">{strings.settings.alwaysVisible}</div>
                        )}
                      </div>
                      <Switch
                        checked={isVisible}
                        ariaLabel={entry.label}
                        onChange={(v) => onSidebarVisibilityChange(entry.id, v)}
                        disabled={isAlwaysVisible}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </section>
  );
}
