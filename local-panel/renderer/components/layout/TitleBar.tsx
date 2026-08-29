import React, { useRef, useState } from "react";
import { AppConfig } from "@/types";
import ServerToggle from "@/components/layout/ServerToggle";
import EnvSelector from "@/components/sidebar/EnvSelector";
import { strings } from "@/lib/strings";
import { Menu, ChevronRight } from "@/lib/icons";
import iconUrl from "@/icon.png";
import HelpTooltip from "@/components/common/HelpTooltip";

interface Props {
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  config: AppConfig;
  serverRunning: boolean;
  serverError: string | null;
  helpText: string;
  onServerStart: () => Promise<void>;
  onServerStop: () => Promise<void>;
  onEnvChange: (id: string | null) => Promise<void>;
  onManageEnvs: () => void;
}

export default function TitleBar({
  sidebarOpen,
  onSidebarToggle,
  config,
  serverRunning,
  serverError,
  helpText,
  onServerStart,
  onServerStop,
  onEnvChange,
  onManageEnvs,
}: Props) {
  const [envDropdownOpen, setEnvDropdownOpen] = useState(false);
  const envDropdownRef = useRef<HTMLDivElement>(null);

  const activeWorkspaceId = config.activeWorkspaceId ?? "";

  const wsEnvironments = (config.environments ?? []).filter(
    (e) => e.workspaceId === activeWorkspaceId
  );

  return (
    <div
      className="h-12 bg-bg0 flex items-center px-3 gap-2 flex-shrink-0 relative"
      style={{
        WebkitAppRegion: "drag",
        paddingRight: "calc(100vw - env(titlebar-area-width, 100vw) + 5px)",
      } as React.CSSProperties}
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-border" />

      {/* Sidebar toggle */}
      <button
        type="button"
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-bg2 text-text-dim hover:text-text-base transition-colors cursor-pointer flex-shrink-0"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onClick={onSidebarToggle}
        aria-label={sidebarOpen ? strings.titleBar.collapseSidebar : strings.titleBar.expandSidebar}
        title={sidebarOpen ? strings.titleBar.collapseSidebar : strings.titleBar.expandSidebar}
      >
        {sidebarOpen ? <Menu size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* App identity */}
      <img
        src={iconUrl}
        className="w-5 h-5 rounded flex-shrink-0"
        alt=""
        draggable={false}
      />
      <span className="text-sm font-semibold text-text-bright tracking-wide select-none">
        {strings.titleBar.appName}
      </span>

      <div className="flex-1" />

      {/* Help tooltip */}
      <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <HelpTooltip text={helpText} />
      </div>

      {/* Environment selector */}
      <EnvSelector
        environments={wsEnvironments}
        activeId={config.activeEnvironmentId ?? null}
        open={envDropdownOpen}
        dropdownRef={envDropdownRef}
        onToggle={() => setEnvDropdownOpen((v) => !v)}
        onClose={() => setEnvDropdownOpen(false)}
        onSelect={async (id) => {
          await onEnvChange(id);
          setEnvDropdownOpen(false);
        }}
        onManage={() => {
          onManageEnvs();
          setEnvDropdownOpen(false);
        }}
      />

      {/* Server play/stop */}
      <ServerToggle
        running={serverRunning}
        error={serverError}
        onStart={onServerStart}
        onStop={onServerStop}
      />

      {/* Server status */}
      {serverError ? (
        <div
          className="flex items-center gap-1.5 text-red text-xs font-medium max-w-[220px]"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title={serverError}
        >
          <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: "var(--c-red)" }} />
          <span className="truncate">{strings.titleBar.portInUse.replace("{port}", String(config.port))}</span>
        </div>
      ) : serverRunning ? (
        <div
          className="flex items-center gap-1.5 text-green text-xs font-medium"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <span
            className="rounded-full flex-shrink-0 animate-pulse-dot"
            style={{
              width: 6,
              height: 6,
              background: "var(--c-green)",
              boxShadow: "0 0 6px var(--c-green)",
            }}
          />
          {strings.titleBar.active.replace("{port}", String(config.port))}
        </div>
      ) : (
        <div
          className="flex items-center gap-1.5 text-text-dim text-xs font-medium"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <span
            className="rounded-full flex-shrink-0"
            style={{
              width: 6,
              height: 6,
              background: "var(--c-text-dim)",
            }}
          />
          {strings.titleBar.stopped.replace("{port}", String(config.port))}
        </div>
      )}
    </div>
  );
}
