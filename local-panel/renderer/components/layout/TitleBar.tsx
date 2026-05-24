import React, { useRef, useState } from "react";
import { AppConfig, Workspace } from "@/types";
import ServerToggle from "@/components/layout/ServerToggle";
import EnvSelector from "@/components/sidebar/EnvSelector";
import WorkspaceSelector from "@/components/sidebar/WorkspaceSelector";
import { strings } from "@/lib/strings";
import { Menu, ChevronRight } from "@/lib/icons";
import iconUrl from "@/icon.png";

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
  onWorkspaceChange: (id: string) => Promise<void>;
  onWorkspaceCreate: () => Promise<void>;
  onWorkspaceRename: (id: string, name: string) => Promise<void>;
  onWorkspaceDelete: (id: string) => Promise<void>;
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
  onWorkspaceChange,
  onWorkspaceCreate,
  onWorkspaceRename,
  onWorkspaceDelete,
}: Props) {
  const [envDropdownOpen, setEnvDropdownOpen] = useState(false);
  const envDropdownRef = useRef<HTMLDivElement>(null);

  const workspaces: Workspace[] = config.workspaces ?? [];
  const activeWorkspaceId = config.activeWorkspaceId ?? "";

  const wsEnvironments = (config.environments ?? []).filter(
    (e) => e.workspaceId === activeWorkspaceId
  );

  return (
    <div
      className="h-9 bg-bg0 flex items-center px-3 gap-2 flex-shrink-0 relative"
      style={{
        WebkitAppRegion: "drag",
        paddingRight: "calc(100vw - env(titlebar-area-width, 100vw) + 5px)",
      } as React.CSSProperties}
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-border" />

      {/* Sidebar toggle */}
      <button
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-bg2 text-text-dim hover:text-text-base transition-colors cursor-pointer flex-shrink-0"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onClick={onSidebarToggle}
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

      {/* Workspace selector */}
      <WorkspaceSelector
        workspaces={workspaces}
        activeId={activeWorkspaceId}
        onSelect={onWorkspaceChange}
        onCreate={onWorkspaceCreate}
        onRename={onWorkspaceRename}
        onDelete={onWorkspaceDelete}
      />

      <div className="flex-1" />

      {/* Help tooltip */}
      <div
        className="relative flex-shrink-0 group"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          className="w-5 h-5 rounded-full border border-border bg-bg2 hover:bg-bg3 text-text-dim hover:text-text-base text-[10px] font-bold flex items-center justify-center transition-colors cursor-default"
          tabIndex={-1}
        >
          ?
        </button>
        <div className="absolute top-full right-0 mt-2 z-50 hidden group-hover:block w-72 p-3 rounded-lg border border-border bg-bg2 shadow-2xl text-xs text-text-dim leading-relaxed pointer-events-none animate-fade-in">
          {helpText}
          <div className="absolute -top-1.5 right-2 w-2.5 h-2.5 bg-bg2 border-l border-t border-border rotate-45" />
        </div>
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

      {/* Server status pill */}
      {serverError ? (
        <div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-red bg-red/10 text-red text-xs font-medium max-w-xs"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title={serverError}
        >
          <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: "var(--c-red)" }} />
          <span className="truncate">{strings.titleBar.portInUse.replace("{port}", String(config.port))}</span>
        </div>
      ) : serverRunning ? (
        <div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-green bg-green/10 text-green text-xs font-medium"
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
          className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-red bg-red/10 text-red text-xs font-medium"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <span
            className="rounded-full flex-shrink-0"
            style={{
              width: 6,
              height: 6,
              background: "var(--c-red)",
            }}
          />
          {strings.titleBar.stopped.replace("{port}", String(config.port))}
        </div>
      )}
    </div>
  );
}
