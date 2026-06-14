import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { LucideProps } from "lucide-react";
import {
    Play, Square, RefreshCw, Plus, Trash2, Pencil, Terminal, Bug, X,
    Box, Layers, Braces, Package, Package2, Hammer, Leaf, Code2,
    Gauge, Cpu, Server, FileText, FileCode, FolderSearch2, ChevronDown, ChevronRight,
    Settings, MoreVertical, ExternalLink, Link2,
} from "@/lib/icons";
import { Button, IconButton, EmptyState, PanelLayout } from "@/components/ui";
import { strings } from "@/lib/strings";
import { appConstants } from "@/lib/appConstants";
import XtermLogViewer from "@/components/applications/XtermLogViewer";
import {
    RUN_CONFIG_TYPE_INFOS,
    RUN_CONFIG_TYPE_LABELS,
    getAvailableTypeInfos,
    CATEGORY_LABELS,
    statusColor,
    statusLabel,
    statusDotColor,
    isActiveStatus,
    type RunConfigType,
    type AppProcessStatus,
    type RunConfigCategory,
} from "@/lib/applicationUtils";
import type { AppConfig, LocalMapping } from "@/types";

// -- Types ---------------------------------------------------------------------

interface ApplicationConfig {
    id: string;
    name: string;
    type: RunConfigType;
    workingDirectory: string;
    args: string;                          // program args (space-sep or one per line)
    debugPort?: number;
    preRunCommand?: string;
    createdAt: number;
    workspaceId: string;
    // -- Shell / Bat / PowerShell / VBScript -----------------------------------
    shellConfig?: {
        scriptPath: string;
        interpreter?: string;             // bash, sh, zsh (empty = system default)
    };
    // -- Node.js ---------------------------------------------------------------
    nodeConfig?: {
        scriptPath: string;
        nodeFlags: string;                // --experimental-vm-modules etc.
        inspectPort?: number;             // default 9229
    };
    // -- NPM / Yarn / PNPM / Bun ----------------------------------------------
    npmConfig?: {
        scriptName: string;
        packageManager: "npm" | "yarn" | "pnpm" | "bun";
    };
    // -- Python ----------------------------------------------------------------
    pythonConfig?: {
        mode: "script" | "module";
        scriptPath: string;
        moduleName: string;
    };
    // -- Java ------------------------------------------------------------------
    javaConfig?: {
        launchMode: "mainClass" | "jar";
        mainClass: string;
        jarPath: string;
        classpath: string;
        vmOptions: string;                // -Xmx2g -Xms512m
        systemProperties: string;         // -Dkey=value per line
        enableAssertions?: boolean;
    };
    // -- Spring Boot -----------------------------------------------------------
    springBootConfig?: {
        buildTool: "maven" | "gradle";
        activeProfiles: string;           // dev,local
        vmArgs: string;
        programArgs: string;
        mainClass?: string;
        beforeLaunchGoal: string;         // mvn compile / ./gradlew classes
    };
    // -- Maven -----------------------------------------------------------------
    mavenConfig?: {
        executable: string;               // ./mvnw or mvn
        pomFile?: string;
        goals: string;                    // clean spring-boot:run
        profiles: string;                 // dev,local
        properties: string;               // -Dkey=value per line
        jvmArgs: string;
        skipTests?: boolean;
        settingsFile?: string;
    };
    // -- Gradle ----------------------------------------------------------------
    gradleConfig?: {
        executable: string;               // ./gradlew or gradle
        tasks: string;                    // bootRun
        projectDir?: string;
        jvmArgs: string;
        properties: string;               // -Pkey=value per line
        skipTests?: boolean;
        extraArgs: string;
    };
    // -- .NET ------------------------------------------------------------------
    dotnetConfig?: {
        projectFile: string;
        configuration: "Debug" | "Release";
        framework?: string;
        launchProfile?: string;
        noBuild?: boolean;
    };
    // -- Go --------------------------------------------------------------------
    goConfig?: {
        packagePath: string;              // ./cmd/server
        buildFlags: string;
        raceDetector?: boolean;
    };
    // -- Docker ----------------------------------------------------------------
    dockerConfig?: {
        runMode: "image" | "build";
        image: string;
        dockerfile?: string;
        buildContext?: string;
        ports: string;                    // 8080:80 per line
        volumes: string;                  // ./data:/data per line
        envVars: string;                  // KEY=VALUE per line
        network?: string;
        entrypoint?: string;
        extraArgs: string;
    };
    // -- Docker Compose --------------------------------------------------------
    dockerComposeConfig?: {
        composeFile: string;
        services?: string;                // space-separated service names
        profile?: string;
        build?: boolean;
        extraArgs: string;
    };
}

interface AppProcessState {
    appId: string;
    status: AppProcessStatus;
    pid?: number;
    exitCode?: number | null;
    error?: string;
    debugPort?: number;
    startedAt?: number;
}

interface AppLogChunk {
    appId: string;
    stream: "stdout" | "stderr" | "system";
    data: string;
    ts: number;
}

// -- Localhost URL detection --------------------------------------------------

const LOCALHOST_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1):\d{1,5}/;

function extractFirstLocalhostUrl(text: string): string | null {
    const m = text.match(LOCALHOST_URL_RE);
    return m ? m[0] : null;
}

function urlToMappingTarget(url: string): string {
    const m = url.match(/https?:\/\/((?:localhost|127\.0\.0\.1):\d{1,5})/);
    return m ? m[1] : "";
}

function findMappingForTarget(mappings: LocalMapping[], target: string): LocalMapping | undefined {
    return mappings.find(m => m.enabled && m.target === target);
}

function openDetectedUrl(detectedUrl: string, mappings: LocalMapping[], serverPort: number): void {
    const target = urlToMappingTarget(detectedUrl);
    const mapping = target ? findMappingForTarget(mappings, target) : undefined;
    if (mapping) {
        const portSuffix = serverPort && serverPort !== 80 ? `:${serverPort}` : "";
        window.api.openExternal(`http://${mapping.domain}${portSuffix}`);
    } else {
        window.api.openExternal(detectedUrl);
    }
}

// -- Icon map (resolved React nodes inside components) -------------------------

type LucideIcon = React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>;

const TYPE_ICON_MAP: Record<string, LucideIcon> = {
    Terminal, FileText, FileCode, Braces, Package, Code2,
    Cpu, Leaf, Package2, Hammer, Server, Gauge, Box, Layers,
};

function TypeIcon({ info, size = 16 }: { info: { iconName: string; iconColor: string }; size?: number }) {
    const Icon = TYPE_ICON_MAP[info.iconName];
    if (!Icon) return <Terminal size={size} className={info.iconColor} />;
    return <Icon size={size} className={info.iconColor} />;
}

// -- Shared input helpers -------------------------------------------------------

const inputCls = "w-full bg-bg1 border border-border/40 rounded px-3 py-1.5 text-sm text-text-bright outline-none focus:border-accent";
const monoInputCls = inputCls + " font-mono";
const textareaCls = inputCls + " font-mono resize-none leading-relaxed";

function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1.5">
                <label className="text-xs text-text-dim font-medium">{label}</label>
                {hint && <span className="text-xs text-text-dim/50 italic">{hint}</span>}
            </div>
            {children}
        </div>
    );
}

function PathInput({
    value,
    onChange,
    placeholder,
    type = "file",
    title,
    filters,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: "file" | "folder";
    title?: string;
    filters?: { name: string; extensions: string[] }[];
}) {
    const browse = async () => {
        const picked = type === "folder"
            ? await window.api.pickFolderPath(title || strings.applications.dialogSelectFolder)
            : await window.api.pickFilePath(title || strings.applications.dialogSelectFile, filters);
        if (picked) onChange(picked);
    };
    return (
        <div className="flex gap-1.5">
            <input
                className={monoInputCls + " flex-1"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
            />
            <button
                type="button"
                onClick={browse}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-dim bg-bg1 border border-border/40 rounded hover:border-accent hover:text-accent transition-colors whitespace-nowrap"
                title={type === "folder" ? strings.applications.browseFolder : strings.applications.browseFile}
            >
                <FolderSearch2 size={12} />
                {strings.applications.browse}
            </button>
        </div>
    );
}

function SectionHeader({ title, expanded, onToggle }: { title: string; expanded: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            className="flex items-center gap-1.5 w-full text-left group py-1"
            onClick={onToggle}
        >
            {expanded ? <ChevronDown size={13} className="text-text-dim" /> : <ChevronRight size={13} className="text-text-dim" />}
            <span className="text-xs font-semibold text-text-dim uppercase tracking-wide group-hover:text-text-base transition-colors">
                {title}
            </span>
            <div className="flex-1 h-px bg-border/20 ml-1" />
        </button>
    );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer group">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border/40 bg-bg1 accent-accent"
            />
            <span className="text-xs text-text-dim group-hover:text-text-base transition-colors">{label}</span>
        </label>
    );
}

// -- Type Selector -------------------------------------------------------------

function TypeSelector({
    value,
    onChange,
    platform,
}: {
    value: RunConfigType;
    onChange: (t: RunConfigType) => void;
    platform: string;
}) {
    const available = useMemo(() => getAvailableTypeInfos(platform), [platform]);
    const groups = useMemo(() => {
        const map = new Map<RunConfigCategory, typeof available>();
        for (const info of available) {
            if (!map.has(info.category)) map.set(info.category, []);
            map.get(info.category)!.push(info);
        }
        return map;
    }, [available]);

    return (
        <div className="space-y-2">
            {Array.from(groups.entries()).map(([cat, infos]) => (
                <div key={cat}>
                    <div className="text-xs text-text-dim/50 uppercase tracking-wide mb-1 font-medium">
                        {CATEGORY_LABELS[cat]}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {infos.map((info) => {
                            const isSelected = value === info.type;
                            return (
                                <button
                                    key={info.type}
                                    type="button"
                                    onClick={() => onChange(info.type)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all
                                        ${isSelected
                                            ? "border-accent bg-accent/10 text-text-bright shadow-sm shadow-accent/20"
                                            : "border-border/30 bg-bg2/40 text-text-dim hover:border-border/60 hover:bg-bg2/70 hover:text-text-base"
                                        }`}
                                >
                                    <TypeIcon info={info} size={13} />
                                    {info.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// -- Per-type field sections ---------------------------------------------------

function ShellFields({ type, cfg, onChange }: {
    type: "shell" | "bat" | "powershell" | "vbs";
    cfg: ApplicationConfig["shellConfig"];
    onChange: (v: ApplicationConfig["shellConfig"]) => void;
}) {
    const c = cfg ?? { scriptPath: "", interpreter: "" };
    const filterMap: Record<string, { name: string; extensions: string[] }[]> = {
        shell: [{ name: strings.applications.filterShellScripts, extensions: ["sh", "bash", "zsh"] }, { name: strings.applications.filterAllFiles, extensions: ["*"] }],
        bat: [{ name: strings.applications.filterBatchFiles, extensions: ["bat", "cmd"] }, { name: strings.applications.filterAllFiles, extensions: ["*"] }],
        powershell: [{ name: strings.applications.filterPowerShell, extensions: ["ps1"] }, { name: strings.applications.filterAllFiles, extensions: ["*"] }],
        vbs: [{ name: strings.applications.filterVbscript, extensions: ["vbs"] }, { name: strings.applications.filterAllFiles, extensions: ["*"] }],
    };
    return (
        <div className="space-y-3">
            <FormRow label={strings.applications.labelScriptFile} hint={strings.applications.hintRequired}>
                <PathInput
                    value={c.scriptPath}
                    onChange={(v) => onChange({ ...c, scriptPath: v })}
                    placeholder={type === "bat" ? appConstants.shell.scriptBat : type === "powershell" ? appConstants.shell.scriptPowershell : type === "vbs" ? appConstants.shell.scriptVbs : appConstants.shell.scriptShell}
                    filters={filterMap[type]}
                    title={strings.applications.dialogSelectScriptFile}
                />
            </FormRow>
            {(type === "shell") && (
                <FormRow label={strings.applications.labelInterpreter} hint={strings.applications.hintInterpreter}>
                    <input
                        className={monoInputCls}
                        value={c.interpreter ?? ""}
                        onChange={(e) => onChange({ ...c, interpreter: e.target.value })}
                        placeholder={appConstants.shell.interpreter}
                    />
                </FormRow>
            )}
        </div>
    );
}

function NodeFields({ cfg, onChange }: {
    cfg: ApplicationConfig["nodeConfig"];
    onChange: (v: ApplicationConfig["nodeConfig"]) => void;
}) {
    const c = cfg ?? { scriptPath: "", nodeFlags: "", inspectPort: appConstants.node.inspectPort };
    return (
        <div className="space-y-3">
            <FormRow label={strings.applications.labelScriptFile} hint={strings.applications.hintRequired}>
                <PathInput
                    value={c.scriptPath}
                    onChange={(v) => onChange({ ...c, scriptPath: v })}
                    placeholder={appConstants.node.scriptPath}
                    filters={[{ name: strings.applications.filterJavaScript, extensions: ["js", "mjs", "cjs", "ts"] }]}
                    title={strings.applications.dialogSelectEntryPoint}
                />
            </FormRow>
            <FormRow label={strings.applications.labelNodeFlags} hint={strings.applications.hintOptional}>
                <input
                    className={monoInputCls}
                    value={c.nodeFlags}
                    onChange={(e) => onChange({ ...c, nodeFlags: e.target.value })}
                    placeholder={appConstants.node.nodeFlags}
                />
            </FormRow>
            <FormRow label={strings.applications.labelInspectorPort} hint={strings.applications.hintForDebugMode}>
                <input
                    type="number"
                    className={monoInputCls + " w-40"}
                    value={c.inspectPort ?? appConstants.node.inspectPort}
                    onChange={(e) => onChange({ ...c, inspectPort: parseInt(e.target.value) || appConstants.node.inspectPort })}
                    placeholder={appConstants.node.inspectPortPlaceholder}
                />
            </FormRow>
        </div>
    );
}

function NpmFields({ cfg, onChange }: {
    cfg: ApplicationConfig["npmConfig"];
    onChange: (v: ApplicationConfig["npmConfig"]) => void;
}) {
    const c = cfg ?? { scriptName: appConstants.npm.scriptName, packageManager: "npm" };
    return (
        <div className="grid grid-cols-2 gap-3">
            <FormRow label={strings.applications.labelScriptName} hint={strings.applications.hintScriptName}>
                <input
                    className={monoInputCls}
                    value={c.scriptName}
                    onChange={(e) => onChange({ ...c, scriptName: e.target.value })}
                    placeholder={appConstants.npm.scriptName}
                />
            </FormRow>
            <FormRow label={strings.applications.labelPackageManager}>
                <select
                    className={inputCls}
                    value={c.packageManager}
                    onChange={(e) => onChange({ ...c, packageManager: e.target.value as "npm" | "yarn" | "pnpm" | "bun" })}
                >
                    {(["npm", "yarn", "pnpm", "bun"] as const).map(pm => (
                        <option key={pm} value={pm}>{pm}</option>
                    ))}
                </select>
            </FormRow>
        </div>
    );
}

function PythonFields({ cfg, onChange }: {
    cfg: ApplicationConfig["pythonConfig"];
    onChange: (v: ApplicationConfig["pythonConfig"]) => void;
}) {
    const c = cfg ?? { mode: "script", scriptPath: "", moduleName: "" };
    return (
        <div className="space-y-3">
            <FormRow label={strings.applications.labelLaunchMode}>
                <div className="flex gap-2">
                    {(["script", "module"] as const).map(m => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => onChange({ ...c, mode: m })}
                            className={`px-3 py-1 text-xs rounded border transition-all ${c.mode === m ? "border-accent bg-accent/10 text-text-bright" : "border-border/30 text-text-dim hover:border-border/60"}`}
                        >
                            {m === "script" ? strings.applications.labelScriptFile : strings.applications.labelModule}
                        </button>
                    ))}
                </div>
            </FormRow>
            {c.mode === "script" ? (
                <FormRow label={strings.applications.labelScriptFile} hint={strings.applications.hintRequired}>
                    <PathInput
                        value={c.scriptPath}
                        onChange={(v) => onChange({ ...c, scriptPath: v })}
                        placeholder={appConstants.python.scriptPath}
                        filters={[{ name: strings.applications.filterPythonFiles, extensions: ["py"] }]}
                        title={strings.applications.dialogSelectPythonScript}
                    />
                </FormRow>
            ) : (
                <FormRow label={strings.applications.labelModuleName} hint={strings.applications.hintModuleName}>
                    <input
                        className={monoInputCls}
                        value={c.moduleName}
                        onChange={(e) => onChange({ ...c, moduleName: e.target.value })}
                        placeholder={appConstants.python.moduleName}
                    />
                </FormRow>
            )}

        </div>
    );
}

function JavaFields({ cfg, onChange }: {
    cfg: ApplicationConfig["javaConfig"];
    onChange: (v: ApplicationConfig["javaConfig"]) => void;
}) {
    const c = cfg ?? { launchMode: "mainClass", mainClass: "", jarPath: "", classpath: "", vmOptions: "", systemProperties: "" };
    return (
        <div className="space-y-3">
            <FormRow label={strings.applications.labelLaunchMode}>
                <div className="flex gap-2">
                    {(["mainClass", "jar"] as const).map(m => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => onChange({ ...c, launchMode: m })}
                            className={`px-3 py-1 text-xs rounded border transition-all ${c.launchMode === m ? "border-accent bg-accent/10 text-text-bright" : "border-border/30 text-text-dim hover:border-border/60"}`}
                        >
                            {m === "mainClass" ? strings.applications.labelMainClass : strings.applications.labelJarFile}
                        </button>
                    ))}
                </div>
            </FormRow>
            {c.launchMode === "mainClass" ? (
                <FormRow label={strings.applications.labelMainClass} hint={strings.applications.hintMainClass}>
                    <input
                        className={monoInputCls}
                        value={c.mainClass}
                        onChange={(e) => onChange({ ...c, mainClass: e.target.value })}
                        placeholder={appConstants.java.mainClass}
                    />
                </FormRow>
            ) : (
                <FormRow label={strings.applications.labelJarFile} hint={strings.applications.hintRequired}>
                    <PathInput
                        value={c.jarPath}
                        onChange={(v) => onChange({ ...c, jarPath: v })}
                        placeholder={appConstants.java.jarPath}
                        filters={[{ name: strings.applications.filterJarFiles, extensions: ["jar"] }]}
                        title={strings.applications.dialogSelectJarFile}
                    />
                </FormRow>
            )}
            <FormRow label={strings.applications.labelClasspath} hint={strings.applications.hintClasspath}>
                <input
                    className={monoInputCls}
                    value={c.classpath}
                    onChange={(e) => onChange({ ...c, classpath: e.target.value })}
                    placeholder={appConstants.java.classpath}
                />
            </FormRow>
            <FormRow label={strings.applications.labelVmOptions} hint={strings.applications.hintVmOptions}>
                <input
                    className={monoInputCls}
                    value={c.vmOptions}
                    onChange={(e) => onChange({ ...c, vmOptions: e.target.value })}
                    placeholder={appConstants.java.vmOptions}
                />
            </FormRow>
            <FormRow label={strings.applications.labelSystemProperties} hint={strings.applications.hintSystemProperties}>
                <textarea
                    className={textareaCls}
                    rows={3}
                    value={c.systemProperties}
                    onChange={(e) => onChange({ ...c, systemProperties: e.target.value })}
                    placeholder={appConstants.java.systemProperties}
                />
            </FormRow>
            <Checkbox
                label={strings.applications.checkboxEnableAssertions}
                checked={!!c.enableAssertions}
                onChange={(v) => onChange({ ...c, enableAssertions: v })}
            />
        </div>
    );
}

function SpringBootFields({ cfg, onChange }: {
    cfg: ApplicationConfig["springBootConfig"];
    onChange: (v: ApplicationConfig["springBootConfig"]) => void;
}) {
    const c = cfg ?? { buildTool: "maven", activeProfiles: "", vmArgs: "", programArgs: "", mainClass: "", beforeLaunchGoal: "" };
    return (
        <div className="space-y-3">
            <FormRow label={strings.applications.labelBuildTool}>
                <div className="flex gap-2">
                    {(["maven", "gradle"] as const).map(bt => (
                        <button
                            key={bt}
                            type="button"
                            onClick={() => onChange({ ...c, buildTool: bt })}
                            className={`px-3 py-1 text-xs rounded border transition-all flex items-center gap-1.5 ${c.buildTool === bt ? "border-accent bg-accent/10 text-text-bright" : "border-border/30 text-text-dim hover:border-border/60"}`}
                        >
                            {bt === "maven" ? <Package2 size={11} /> : <Hammer size={11} />}
                            {bt === "maven" ? strings.applications.buildToolMaven : strings.applications.buildToolGradle}
                        </button>
                    ))}
                </div>
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
                <FormRow label={strings.applications.labelActiveProfiles} hint={strings.applications.hintCommaSeparated}>
                    <input
                        className={monoInputCls}
                        value={c.activeProfiles}
                        onChange={(e) => onChange({ ...c, activeProfiles: e.target.value })}
                        placeholder={appConstants.springBoot.activeProfiles}
                    />
                </FormRow>
                <FormRow label={strings.applications.labelMainClass} hint={strings.applications.hintMainClassAutoDetected}>
                    <input
                        className={monoInputCls}
                        value={c.mainClass ?? ""}
                        onChange={(e) => onChange({ ...c, mainClass: e.target.value })}
                        placeholder={appConstants.springBoot.mainClass}
                    />
                </FormRow>
            </div>
            <FormRow label={strings.applications.labelVmArguments}>
                <input
                    className={monoInputCls}
                    value={c.vmArgs}
                    onChange={(e) => onChange({ ...c, vmArgs: e.target.value })}
                    placeholder={appConstants.springBoot.vmArgs}
                />
            </FormRow>
            <FormRow label={strings.applications.labelProgramArguments}>
                <input
                    className={monoInputCls}
                    value={c.programArgs}
                    onChange={(e) => onChange({ ...c, programArgs: e.target.value })}
                    placeholder={appConstants.springBoot.programArgs}
                />
            </FormRow>
            <FormRow label={strings.applications.labelBeforeLaunchGoal} hint={strings.applications.hintBeforeLaunchGoal}>
                <input
                    className={monoInputCls}
                    value={c.beforeLaunchGoal}
                    onChange={(e) => onChange({ ...c, beforeLaunchGoal: e.target.value })}
                    placeholder={c.buildTool === "maven" ? appConstants.springBoot.beforeLaunchGoalMaven : appConstants.springBoot.beforeLaunchGoalGradle}
                />
            </FormRow>
        </div>
    );
}

function MavenFields({ cfg, onChange }: {
    cfg: ApplicationConfig["mavenConfig"];
    onChange: (v: ApplicationConfig["mavenConfig"]) => void;
}) {
    const c = cfg ?? { executable: appConstants.maven.executable, goals: appConstants.maven.goals, profiles: "", properties: "", jvmArgs: "", pomFile: "", settingsFile: "", skipTests: false };
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
                <FormRow label={strings.applications.labelMavenExecutable}>
                    <input className={monoInputCls} value={c.executable} onChange={(e) => onChange({ ...c, executable: e.target.value })} placeholder={appConstants.maven.executable} />
                </FormRow>
                <div className="col-span-2">
                    <FormRow label={strings.applications.labelPomFile} hint={strings.applications.hintPomFile}>
                        <PathInput value={c.pomFile ?? ""} onChange={(v) => onChange({ ...c, pomFile: v })} placeholder={appConstants.maven.pomFile} filters={[{ name: strings.applications.filterPomFiles, extensions: ["xml"] }]} title={strings.applications.dialogSelectPom} />
                    </FormRow>
                </div>
            </div>
            <FormRow label={strings.applications.labelGoals} hint={strings.applications.hintGoals}>
                <input className={monoInputCls} value={c.goals} onChange={(e) => onChange({ ...c, goals: e.target.value })} placeholder={appConstants.maven.goals} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
                <FormRow label={strings.applications.labelProfiles} hint={strings.applications.hintCommaSeparated}>
                    <input className={monoInputCls} value={c.profiles} onChange={(e) => onChange({ ...c, profiles: e.target.value })} placeholder={appConstants.maven.profiles} />
                </FormRow>
                <FormRow label={strings.applications.labelJvmArguments}>
                    <input className={monoInputCls} value={c.jvmArgs} onChange={(e) => onChange({ ...c, jvmArgs: e.target.value })} placeholder={appConstants.maven.jvmArgs} />
                </FormRow>
            </div>
            <FormRow label={strings.applications.labelPropertiesD} hint={strings.applications.hintPropertiesD}>
                <textarea className={textareaCls} rows={3} value={c.properties} onChange={(e) => onChange({ ...c, properties: e.target.value })} placeholder={appConstants.maven.properties} />
            </FormRow>
            <div className="flex items-center gap-4">
                <Checkbox label={strings.applications.checkboxSkipTestsMaven} checked={!!c.skipTests} onChange={(v) => onChange({ ...c, skipTests: v })} />
            </div>
            <FormRow label={strings.applications.labelSettingsFile} hint={strings.applications.hintOptional}>
                <PathInput value={c.settingsFile ?? ""} onChange={(v) => onChange({ ...c, settingsFile: v })} placeholder={appConstants.maven.settingsFile} filters={[{ name: strings.applications.filterXmlFiles, extensions: ["xml"] }]} title={strings.applications.dialogSelectSettings} />
            </FormRow>
        </div>
    );
}

function GradleFields({ cfg, onChange }: {
    cfg: ApplicationConfig["gradleConfig"];
    onChange: (v: ApplicationConfig["gradleConfig"]) => void;
}) {
    const c = cfg ?? { executable: appConstants.gradle.executable, tasks: appConstants.gradle.tasks, projectDir: "", jvmArgs: "", properties: "", skipTests: false, extraArgs: "" };
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
                <FormRow label={strings.applications.labelGradleExecutable}>
                    <input className={monoInputCls} value={c.executable} onChange={(e) => onChange({ ...c, executable: e.target.value })} placeholder={appConstants.gradle.executable} />
                </FormRow>
                <div className="col-span-2">
                    <FormRow label={strings.applications.labelProjectDirectory} hint={strings.applications.hintOptional}>
                        <PathInput value={c.projectDir ?? ""} onChange={(v) => onChange({ ...c, projectDir: v })} placeholder={appConstants.gradle.projectDir} type="folder" title={strings.applications.dialogSelectGradleProject} />
                    </FormRow>
                </div>
            </div>
            <FormRow label={strings.applications.labelTasks}>
                <input className={monoInputCls} value={c.tasks} onChange={(e) => onChange({ ...c, tasks: e.target.value })} placeholder={appConstants.gradle.tasks} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
                <FormRow label={strings.applications.labelJvmArguments}>
                    <input className={monoInputCls} value={c.jvmArgs} onChange={(e) => onChange({ ...c, jvmArgs: e.target.value })} placeholder={appConstants.gradle.jvmArgs} />
                </FormRow>
                <FormRow label={strings.applications.labelExtraArguments}>
                    <input className={monoInputCls} value={c.extraArgs} onChange={(e) => onChange({ ...c, extraArgs: e.target.value })} placeholder={appConstants.gradle.extraArgs} />
                </FormRow>
            </div>
            <FormRow label={strings.applications.labelPropertiesP} hint={strings.applications.hintPropertiesP}>
                <textarea className={textareaCls} rows={2} value={c.properties} onChange={(e) => onChange({ ...c, properties: e.target.value })} placeholder={appConstants.gradle.properties} />
            </FormRow>
            <Checkbox label={strings.applications.checkboxSkipTestsGradle} checked={!!c.skipTests} onChange={(v) => onChange({ ...c, skipTests: v })} />
        </div>
    );
}

function DotnetFields({ cfg, onChange }: {
    cfg: ApplicationConfig["dotnetConfig"];
    onChange: (v: ApplicationConfig["dotnetConfig"]) => void;
}) {
    const c = cfg ?? { projectFile: "", configuration: "Debug", framework: "", launchProfile: "", noBuild: false };
    return (
        <div className="space-y-3">
            <FormRow label={strings.applications.labelProjectFile} hint={strings.applications.hintRequired}>
                <PathInput value={c.projectFile} onChange={(v) => onChange({ ...c, projectFile: v })} placeholder={appConstants.dotnet.projectFile} filters={[{ name: strings.applications.filterProjectFiles, extensions: ["csproj", "fsproj", "vbproj"] }]} title={strings.applications.dialogSelectProjectFile} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
                <FormRow label={strings.applications.labelConfiguration}>
                    <select className={inputCls} value={c.configuration} onChange={(e) => onChange({ ...c, configuration: e.target.value as "Debug" | "Release" })}>
                        <option value="Debug">Debug</option>
                        <option value="Release">Release</option>
                    </select>
                </FormRow>
                <FormRow label={strings.applications.labelTargetFramework} hint={strings.applications.hintOptional}>
                    <input className={monoInputCls} value={c.framework ?? ""} onChange={(e) => onChange({ ...c, framework: e.target.value })} placeholder={appConstants.dotnet.framework} />
                </FormRow>
            </div>
            <FormRow label={strings.applications.labelLaunchProfile} hint={strings.applications.hintLaunchProfile}>
                <input className={monoInputCls} value={c.launchProfile ?? ""} onChange={(e) => onChange({ ...c, launchProfile: e.target.value })} placeholder={appConstants.dotnet.launchProfile} />
            </FormRow>
            <Checkbox label={strings.applications.checkboxNoBuild} checked={!!c.noBuild} onChange={(v) => onChange({ ...c, noBuild: v })} />
        </div>
    );
}

function GoFields({ cfg, onChange }: {
    cfg: ApplicationConfig["goConfig"];
    onChange: (v: ApplicationConfig["goConfig"]) => void;
}) {
    const c = cfg ?? { packagePath: appConstants.go.packagePathDefault, buildFlags: "", raceDetector: false };
    return (
        <div className="space-y-3">
            <FormRow label={strings.applications.labelPackagePath} hint={strings.applications.hintPackagePath}>
                <input className={monoInputCls} value={c.packagePath} onChange={(e) => onChange({ ...c, packagePath: e.target.value })} placeholder={appConstants.go.packagePath} />
            </FormRow>
            <FormRow label={strings.applications.labelBuildFlags} hint={strings.applications.hintOptional}>
                <input className={monoInputCls} value={c.buildFlags} onChange={(e) => onChange({ ...c, buildFlags: e.target.value })} placeholder={appConstants.go.buildFlags} />
            </FormRow>
            <Checkbox label={strings.applications.checkboxRaceDetector} checked={!!c.raceDetector} onChange={(v) => onChange({ ...c, raceDetector: v })} />
        </div>
    );
}

function DockerFields({ cfg, onChange }: {
    cfg: ApplicationConfig["dockerConfig"];
    onChange: (v: ApplicationConfig["dockerConfig"]) => void;
}) {
    const c = cfg ?? { runMode: "image", image: "", dockerfile: "", buildContext: "", ports: "", volumes: "", envVars: "", network: "", entrypoint: "", extraArgs: "" };
    return (
        <div className="space-y-3">
            <FormRow label={strings.applications.labelRunMode}>
                <div className="flex gap-2">
                    {(["image", "build"] as const).map(m => (
                        <button key={m} type="button" onClick={() => onChange({ ...c, runMode: m })}
                            className={`px-3 py-1 text-xs rounded border transition-all ${c.runMode === m ? "border-accent bg-accent/10 text-text-bright" : "border-border/30 text-text-dim hover:border-border/60"}`}>
                            {m === "image" ? strings.applications.runModePullImage : strings.applications.runModeBuildRun}
                        </button>
                    ))}
                </div>
            </FormRow>
            {c.runMode === "image" ? (
                <FormRow label={strings.applications.labelImage} hint={strings.applications.hintRequired}>
                    <input className={monoInputCls} value={c.image} onChange={(e) => onChange({ ...c, image: e.target.value })} placeholder={appConstants.docker.image} />
                </FormRow>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                    <FormRow label={strings.applications.labelDockerfile}>
                        <PathInput value={c.dockerfile ?? ""} onChange={(v) => onChange({ ...c, dockerfile: v })} placeholder={appConstants.docker.dockerfile} filters={[{ name: strings.applications.filterDockerfile, extensions: ["*"] }]} title={strings.applications.dialogSelectDockerfile} />
                    </FormRow>
                    <FormRow label={strings.applications.labelBuildContext}>
                        <PathInput value={c.buildContext ?? ""} onChange={(v) => onChange({ ...c, buildContext: v })} placeholder={appConstants.docker.buildContext} type="folder" title={strings.applications.dialogSelectBuildContext} />
                    </FormRow>
                </div>
            )}
            <div className="grid grid-cols-2 gap-3">
                <FormRow label={strings.applications.labelPortMappings} hint={strings.applications.hintHostContainer}>
                    <textarea className={textareaCls} rows={3} value={c.ports} onChange={(e) => onChange({ ...c, ports: e.target.value })} placeholder={appConstants.docker.ports} />
                </FormRow>
                <FormRow label={strings.applications.labelVolumeMounts} hint={strings.applications.hintHostContainer}>
                    <textarea className={textareaCls} rows={3} value={c.volumes} onChange={(e) => onChange({ ...c, volumes: e.target.value })} placeholder={appConstants.docker.volumes} />
                </FormRow>
            </div>
            <FormRow label={strings.applications.labelEnvironmentVariables} hint={strings.applications.hintEnvVars}>
                <textarea className={textareaCls} rows={3} value={c.envVars} onChange={(e) => onChange({ ...c, envVars: e.target.value })} placeholder={appConstants.docker.envVars} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
                <FormRow label={strings.applications.labelNetwork} hint={strings.applications.hintOptional}>
                    <input className={monoInputCls} value={c.network ?? ""} onChange={(e) => onChange({ ...c, network: e.target.value })} placeholder={appConstants.docker.network} />
                </FormRow>
                <FormRow label={strings.applications.labelEntrypointOverride} hint={strings.applications.hintOptional}>
                    <input className={monoInputCls} value={c.entrypoint ?? ""} onChange={(e) => onChange({ ...c, entrypoint: e.target.value })} placeholder={appConstants.docker.entrypoint} />
                </FormRow>
            </div>
            <FormRow label={strings.applications.labelExtraDockerRunArguments}>
                <input className={monoInputCls} value={c.extraArgs} onChange={(e) => onChange({ ...c, extraArgs: e.target.value })} placeholder={appConstants.docker.extraArgs} />
            </FormRow>
        </div>
    );
}

function DockerComposeFields({ cfg, onChange }: {
    cfg: ApplicationConfig["dockerComposeConfig"];
    onChange: (v: ApplicationConfig["dockerComposeConfig"]) => void;
}) {
    const c = cfg ?? { composeFile: appConstants.dockerCompose.composeFile, services: "", profile: "", build: false, extraArgs: "" };
    return (
        <div className="space-y-3">
            <FormRow label={strings.applications.labelComposeFile} hint={strings.applications.hintRequired}>
                <PathInput value={c.composeFile} onChange={(v) => onChange({ ...c, composeFile: v })} placeholder={appConstants.dockerCompose.composeFile}
                    filters={[{ name: strings.applications.filterComposeFiles, extensions: ["yml", "yaml"] }]} title={strings.applications.dialogSelectComposeFile} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
                <FormRow label={strings.applications.labelServices} hint={strings.applications.hintServices}>
                    <input className={monoInputCls} value={c.services ?? ""} onChange={(e) => onChange({ ...c, services: e.target.value })} placeholder={appConstants.dockerCompose.services} />
                </FormRow>
                <FormRow label={strings.applications.labelProfile} hint={strings.applications.hintOptional}>
                    <input className={monoInputCls} value={c.profile ?? ""} onChange={(e) => onChange({ ...c, profile: e.target.value })} placeholder={appConstants.dockerCompose.profile} />
                </FormRow>
            </div>
            <FormRow label={strings.applications.labelExtraArguments}>
                <input className={monoInputCls} value={c.extraArgs} onChange={(e) => onChange({ ...c, extraArgs: e.target.value })} placeholder={appConstants.dockerCompose.extraArgs} />
            </FormRow>
            <Checkbox label={strings.applications.checkboxBuildImages} checked={!!c.build} onChange={(v) => onChange({ ...c, build: v })} />
        </div>
    );
}

// -- Main config form ----------------------------------------------------------

interface FormState {
    name: string;
    type: RunConfigType;
    workingDirectory: string;
    args: string;
    preRunCommand: string;
    debugPort: string;
    shellConfig: ApplicationConfig["shellConfig"];
    nodeConfig: ApplicationConfig["nodeConfig"];
    npmConfig: ApplicationConfig["npmConfig"];
    pythonConfig: ApplicationConfig["pythonConfig"];
    javaConfig: ApplicationConfig["javaConfig"];
    springBootConfig: ApplicationConfig["springBootConfig"];
    mavenConfig: ApplicationConfig["mavenConfig"];
    gradleConfig: ApplicationConfig["gradleConfig"];
    dotnetConfig: ApplicationConfig["dotnetConfig"];
    goConfig: ApplicationConfig["goConfig"];
    dockerConfig: ApplicationConfig["dockerConfig"];
    dockerComposeConfig: ApplicationConfig["dockerComposeConfig"];
}

function initForm(initial?: ApplicationConfig): FormState {
    return {
        name: initial?.name ?? "",
        type: initial?.type ?? "shell",
        workingDirectory: initial?.workingDirectory ?? "",
        args: initial?.args ?? "",
        preRunCommand: initial?.preRunCommand ?? "",
        debugPort: initial?.debugPort?.toString() ?? "",
        shellConfig: initial?.shellConfig,
        nodeConfig: initial?.nodeConfig,
        npmConfig: initial?.npmConfig,
        pythonConfig: initial?.pythonConfig,
        javaConfig: initial?.javaConfig,
        springBootConfig: initial?.springBootConfig,
        mavenConfig: initial?.mavenConfig,
        gradleConfig: initial?.gradleConfig,
        dotnetConfig: initial?.dotnetConfig,
        goConfig: initial?.goConfig,
        dockerConfig: initial?.dockerConfig,
        dockerComposeConfig: initial?.dockerComposeConfig,
    };
}

function AppConfigForm({
    initial,
    wsId,
    platform,
    onSave,
    onCancel,
}: {
    initial?: ApplicationConfig;
    wsId: string;
    platform: string;
    onSave: (app: ApplicationConfig) => void;
    onCancel: () => void;
}) {
    const s = strings.applications;
    const [form, setForm] = useState<FormState>(() => initForm(initial));
    const [beforeLaunchExpanded, setBeforeLaunchExpanded] = useState(false);

    const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm(prev => ({ ...prev, [key]: value }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const app: ApplicationConfig = {
            id: initial?.id ?? "",
            name: form.name,
            type: form.type,
            workingDirectory: form.workingDirectory,
            args: form.args,
            debugPort: form.debugPort ? parseInt(form.debugPort, 10) : undefined,
            preRunCommand: form.preRunCommand || undefined,
            createdAt: initial?.createdAt ?? Date.now(),
            workspaceId: wsId,
            shellConfig: form.shellConfig,
            nodeConfig: form.nodeConfig,
            npmConfig: form.npmConfig,
            pythonConfig: form.pythonConfig,
            javaConfig: form.javaConfig,
            springBootConfig: form.springBootConfig,
            mavenConfig: form.mavenConfig,
            gradleConfig: form.gradleConfig,
            dotnetConfig: form.dotnetConfig,
            goConfig: form.goConfig,
            dockerConfig: form.dockerConfig,
            dockerComposeConfig: form.dockerComposeConfig,
        };
        onSave(app);
    };

    const typeInfo = RUN_CONFIG_TYPE_INFOS.find(i => i.type === form.type)!;

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-0 flex-1 overflow-hidden">
            {/* -- Form header -------------------------------------------- */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border/20 bg-bg2/20 flex-shrink-0">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${typeInfo ? "bg-bg1 border border-border/30" : "bg-bg2"}`}>
                    {typeInfo && <TypeIcon info={typeInfo} size={18} />}
                </div>
                <div className="flex-1">
                    <input
                        className="w-full bg-transparent text-lg font-semibold text-text-bright outline-none placeholder:text-text-dim/40 border-b border-transparent focus:border-accent/50 transition-colors pb-0.5"
                        placeholder={s.configNamePlaceholder}
                        value={form.name}
                        onChange={(e) => patch("name", e.target.value)}
                        required
                    />
                    <div className="text-xs text-text-dim mt-0.5">{typeInfo?.label ?? form.type}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
                        {strings.common.cancel}
                    </Button>
                    <Button variant="primary" size="sm" type="submit">
                        {initial ? s.updateApplication : s.addApplication}
                    </Button>
                </div>
            </div>

            {/* -- Scrollable body ----------------------------------------- */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                {/* Type Selector */}
                <div>
                    <SectionHeader title={s.sectionRunConfigType} expanded={true} onToggle={() => { }} />
                    <div className="mt-2">
                        <TypeSelector
                            value={form.type}
                            onChange={(t) => patch("type", t)}
                            platform={platform}
                        />
                    </div>
                </div>

                {/* Working Directory */}
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-text-dim uppercase tracking-wide">{s.labelWorkingDirectory}</span>
                        <div className="flex-1 h-px bg-border/20 ml-1" />
                        <span className="text-xs text-text-dim/50 italic">{s.hintRequired}</span>
                    </div>
                    <PathInput
                        value={form.workingDirectory}
                        onChange={(v) => patch("workingDirectory", v)}
                        placeholder={appConstants.common.workingDirectory}
                        type="folder"
                        title={s.dialogSelectProjectDirectory}
                    />
                </div>

                {/* Type-specific fields */}
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-text-dim uppercase tracking-wide">{typeInfo?.label ?? s.sectionConfiguration}</span>
                        <div className="flex-1 h-px bg-border/20 ml-1" />
                    </div>
                    <div className="mt-2">
                        {(form.type === "shell" || form.type === "bat" || form.type === "powershell" || form.type === "vbs") && (
                            <ShellFields type={form.type as "shell" | "bat" | "powershell" | "vbs"} cfg={form.shellConfig} onChange={(v) => patch("shellConfig", v)} />
                        )}
                        {form.type === "node" && <NodeFields cfg={form.nodeConfig} onChange={(v) => patch("nodeConfig", v)} />}
                        {form.type === "npm" && <NpmFields cfg={form.npmConfig} onChange={(v) => patch("npmConfig", v)} />}
                        {form.type === "python" && <PythonFields cfg={form.pythonConfig} onChange={(v) => patch("pythonConfig", v)} />}
                        {form.type === "java" && <JavaFields cfg={form.javaConfig} onChange={(v) => patch("javaConfig", v)} />}
                        {form.type === "spring-boot" && <SpringBootFields cfg={form.springBootConfig} onChange={(v) => patch("springBootConfig", v)} />}
                        {form.type === "maven" && <MavenFields cfg={form.mavenConfig} onChange={(v) => patch("mavenConfig", v)} />}
                        {form.type === "gradle" && <GradleFields cfg={form.gradleConfig} onChange={(v) => patch("gradleConfig", v)} />}
                        {form.type === "dotnet" && <DotnetFields cfg={form.dotnetConfig} onChange={(v) => patch("dotnetConfig", v)} />}
                        {form.type === "go" && <GoFields cfg={form.goConfig} onChange={(v) => patch("goConfig", v)} />}
                        {form.type === "docker" && <DockerFields cfg={form.dockerConfig} onChange={(v) => patch("dockerConfig", v)} />}
                        {form.type === "docker-compose" && <DockerComposeFields cfg={form.dockerComposeConfig} onChange={(v) => patch("dockerComposeConfig", v)} />}
                    </div>
                </div>

                {/* Common: program arguments */}
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-text-dim uppercase tracking-wide">{s.labelProgramArguments}</span>
                        <div className="flex-1 h-px bg-border/20 ml-1" />
                        <span className="text-xs text-text-dim/50 italic">{s.hintOptional}</span>
                    </div>
                    <input
                        className={monoInputCls}
                        value={form.args}
                        onChange={(e) => patch("args", e.target.value)}
                        placeholder={appConstants.common.programArgs}
                    />
                </div>

                {/* Collapsible: Before launch */}
                <div>
                    <SectionHeader title={s.sectionBeforeLaunch} expanded={beforeLaunchExpanded} onToggle={() => setBeforeLaunchExpanded(p => !p)} />
                    {beforeLaunchExpanded && (
                        <div className="mt-2 grid grid-cols-2 gap-3">
                            <FormRow label={s.labelPreRunCommand} hint={s.hintPreRunCommand}>
                                <input
                                    className={monoInputCls}
                                    value={form.preRunCommand}
                                    onChange={(e) => patch("preRunCommand", e.target.value)}
                                    placeholder={appConstants.common.preRunCommand}
                                />
                            </FormRow>
                            <FormRow label={s.labelDebugPortOverride} hint={s.hintDebugPortOverride}>
                                <input
                                    type="number"
                                    className={monoInputCls}
                                    value={form.debugPort}
                                    onChange={(e) => patch("debugPort", e.target.value)}
                                    placeholder={appConstants.common.debugPort}
                                />
                            </FormRow>
                        </div>
                    )}
                </div>

            </div>
        </form>
    );
}

// -- Runtime / port helpers --------------------------------------------------

function deriveRuntime(app: ApplicationConfig): string {
    const r = strings.applications;
    switch (app.type) {
        case "node": return r.runtimeNode;
        case "npm": return r.runtimeNode;
        case "python": return r.runtimePython;
        case "java": return r.runtimeJava;
        case "spring-boot": return r.runtimeSpringBoot;
        case "maven": return r.runtimeMaven;
        case "gradle": return r.runtimeGradle;
        case "dotnet": return r.runtimeDotnet;
        case "go": return r.runtimeGo;
        case "docker": return app.dockerConfig?.image
            ? `${r.runtimeDocker} (${app.dockerConfig.image.split(":")[0]})`
            : r.runtimeDocker;
        case "docker-compose": return r.runtimeDockerCompose;
        case "shell": return r.runtimeShellScript;
        case "bat": return r.runtimeBatchFile;
        case "powershell": return r.runtimePowershell;
        case "vbs": return r.runtimeVbscript;
        default: return app.type;
    }
}

function derivePort(app: ApplicationConfig): string | null {
    if (typeof app.args === "string" && app.args) {
        const m = app.args.match(/(?:--port|-p)\s+(\d+)/i);
        if (m) return m[1];
    }
    if (app.type === "node" && app.nodeConfig?.inspectPort) return String(app.nodeConfig.inspectPort);
    if (app.debugPort) return String(app.debugPort);
    if (app.type === "docker" && app.dockerConfig?.ports) {
        const ports = app.dockerConfig.ports;
        if (typeof ports === "string") {
            const first = ports.split("\n")[0].trim();
            if (first) return first.split(":")[0];
        }
    }
    return null;
}

function formatUptime(startedAt: number): string {
    const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// -- Stats Bar ----------------------------------------------------------------

function StatsBar({ apps, states }: { apps: ApplicationConfig[]; states: Map<string, AppProcessState> }) {
    const running = apps.filter(a => isActiveStatus(states.get(a.id)?.status ?? "idle")).length;
    const debugging = apps.filter(a => states.get(a.id)?.status === "debugging").length;
    const errors = apps.filter(a => states.get(a.id)?.status === "error").length;
    const stopped = apps.length - running - errors;

    const stats = [
        { value: running, label: strings.applications.statRunning, color: "text-green-400" },
        { value: stopped, label: strings.applications.statStopped, color: "text-text-dim" },
        { value: debugging, label: strings.applications.statDebugActive, color: "text-blue-400" },
        { value: errors, label: strings.applications.statErrors, color: "text-red-400" },
    ];

    return (
        <div className="mx-6 mt-4 mb-1 rounded-xl border border-border/20 bg-bg2/20 px-5 py-4 flex-shrink-0">
            <div className="text-xs text-text-dim/50 uppercase tracking-widest font-semibold mb-3">
                {strings.applications.applicationStatus}
            </div>
            <div className="flex items-end gap-8">
                {stats.map(s => (
                    <div key={s.label}>
                        <div className={`text-2xl font-bold tracking-tight leading-none ${s.color}`}>{s.value}</div>
                        <div className="text-[10px] text-text-dim/50 uppercase tracking-widest mt-1.5">{s.label}</div>
                    </div>
                ))}
                <div className="ml-auto self-end">
                    <div className="flex gap-0.5 items-end h-10">
                        {apps.map(a => {
                            const st = states.get(a.id)?.status ?? "idle";
                            const heightCls = isActiveStatus(st) ? "h-full" : st === "error" ? "h-2/3" : "h-1/3";
                            const colorCls = isActiveStatus(st) ? "bg-green-400/60" : st === "error" ? "bg-red-400/60" : "bg-border/40";
                            return <div key={a.id} className={`w-1.5 rounded-t transition-all ${heightCls} ${colorCls}`} />;
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// -- App Card -----------------------------------------------------------------

function AppCard({
    app,
    state,
    selected,
    onSelect,
    onStart,
    onDebug,
    onStop,
    onEdit,
    onDelete,
    detectedUrl,
    mappings,
    serverPort,
    onAddMapping,
}: {
    app: ApplicationConfig;
    state: AppProcessState | null;
    selected: boolean;
    onSelect: () => void;
    onStart: () => void;
    onDebug: () => void;
    onStop: () => void;
    onEdit: () => void;
    onDelete: () => void;
    detectedUrl?: string;
    mappings: LocalMapping[];
    serverPort: number;
    onAddMapping?: (target: string) => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [, tick] = useState(0);
    const menuRef = React.useRef<HTMLDivElement>(null);

    const status = state?.status ?? "idle";
    const isActive = isActiveStatus(status);
    const typeInfo = RUN_CONFIG_TYPE_INFOS.find(i => i.type === app.type);
    const runtimeLabel = deriveRuntime(app);
    const portLabel = derivePort(app);
    const uptime = (isActive && state?.startedAt) ? formatUptime(state.startedAt) : null;

    // tick every second while running to refresh uptime
    useEffect(() => {
        if (!isActive || !state?.startedAt) return;
        const id = setInterval(() => tick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [isActive, state?.startedAt]);

    // close 3-dot menu on outside click
    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [menuOpen]);

    const borderCls = isActive
        ? "border-green-500/25 bg-green-500/[0.03]"
        : status === "error"
            ? "border-red-500/25 bg-red-500/[0.03]"
            : "border-border/20 bg-bg2/30";

    return (
        <div
            className={`rounded-xl border transition-all cursor-pointer flex flex-col select-none
                ${borderCls}
                ${selected
                    ? "ring-2 ring-accent/40 ring-offset-1 ring-offset-bg1"
                    : "hover:border-border/40 hover:bg-bg2/50"
                }`}
            onClick={onSelect}
        >
            {/* -- Card header -- */}
            <div className="flex items-start gap-3 p-4 pb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border
                    ${isActive ? "bg-bg1/70 border-border/25" : "bg-bg1/40 border-border/15"}`}>
                    {typeInfo
                        ? <TypeIcon info={typeInfo} size={16} />
                        : <Terminal size={16} className="text-text-dim" />
                    }
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-text-bright truncate leading-tight">{app.name}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                            ${statusDotColor(status)} ${isActive ? "animate-pulse" : ""}`} />
                        <span className={`text-xs font-medium ${statusColor(status)}`}>
                            {statusLabel(status)}
                        </span>
                    </div>
                </div>
                {/* 3-dot context menu */}
                <div ref={menuRef} className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <IconButton
                        icon={<MoreVertical size={14} />}
                        className="w-6 h-6 border-0 bg-transparent"
                        onClick={() => setMenuOpen(v => !v)}
                    />
                    {menuOpen && (
                        <div className="absolute right-0 top-7 z-20 w-36 rounded-lg border border-border/30 bg-bg1 shadow-xl py-1 overflow-hidden">
                            <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-base hover:bg-bg2 transition-colors"
                                onClick={() => { onEdit(); setMenuOpen(false); }}
                            >
                                <Pencil size={12} /> {strings.applications.menuEditConfig}
                            </button>
                            <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                                onClick={() => { onDelete(); setMenuOpen(false); }}
                            >
                                <Trash2 size={12} /> {strings.common.delete}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* -- Info rows -- */}
            <div className="px-4 pb-3 space-y-2 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-text-dim/60 flex-shrink-0">{strings.applications.infoRuntime}</span>
                    <span className="text-xs text-text-base font-mono truncate text-right">{runtimeLabel}</span>
                </div>
                {portLabel && (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-text-dim/60 flex-shrink-0">{strings.applications.infoPort}</span>
                        <span className="text-xs text-text-bright font-mono font-semibold">{portLabel}</span>
                    </div>
                )}
                {isActive && state?.pid && (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-text-dim/60 flex-shrink-0">{strings.applications.infoPid}</span>
                        <span className="text-xs text-text-dim font-mono">{state.pid}</span>
                    </div>
                )}
                {uptime && (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-text-dim/60 flex-shrink-0">{strings.applications.infoUptime}</span>
                        <span className="text-xs text-text-base font-mono">{uptime}</span>
                    </div>
                )}
                {status === "debugging" && state?.debugPort && (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-blue-400/70 flex-shrink-0">{strings.applications.infoDebugPort}</span>
                        <span className="text-xs text-blue-400 font-mono font-semibold">{state.debugPort}</span>
                    </div>
                )}
                {status === "error" && state?.error && (
                    <div className="mt-1 text-xs text-red-400 font-mono bg-red-500/10 rounded px-2 py-1.5 line-clamp-2">
                        {state.error}
                    </div>
                )}
                {detectedUrl && (
                    <div
                        className="mt-1 flex items-center gap-1.5 bg-bg1/50 rounded px-2 py-1.5 border border-border/20"
                        onClick={e => e.stopPropagation()}
                    >
                        <span className="text-[10px] text-text-dim/50 flex-shrink-0 uppercase tracking-wide">{strings.applications.infoUrl}</span>
                        <span className="text-xs font-mono text-text-bright/80 truncate flex-1">
                            {detectedUrl.replace(/^https?:\/\//, "")}
                        </span>
                        <button
                            title={findMappingForTarget(mappings, urlToMappingTarget(detectedUrl)) ? strings.applications.openMappedUrl : strings.applications.openInBrowser}
                            className="text-text-dim hover:text-accent transition-colors flex-shrink-0 p-0.5"
                            onClick={e => { e.stopPropagation(); openDetectedUrl(detectedUrl, mappings, serverPort); }}
                        >
                            <ExternalLink size={11} />
                        </button>
                        <button
                            title={strings.applications.addMappingForUrl}
                            className="text-text-dim hover:text-accent transition-colors flex-shrink-0 p-0.5"
                            onClick={e => { e.stopPropagation(); onAddMapping?.(urlToMappingTarget(detectedUrl)); }}
                        >
                            <Link2 size={11} />
                        </button>
                    </div>
                )}
            </div>

            {/* -- Action buttons -- */}
            <div className="flex items-center gap-2 px-3 pb-3 pt-2">
                {isActive ? (
                    <Button
                        variant="danger"
                        size="sm"
                        icon={<Square size={11} strokeWidth={2.5} />}
                        className="flex-1 justify-center"
                        onClick={e => { e.stopPropagation(); onStop(); }}
                    >
                        {strings.applications.actionStop}
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        size="sm"
                        icon={<Play size={11} strokeWidth={2.5} />}
                        className="flex-1 justify-center"
                        onClick={e => { e.stopPropagation(); onStart(); }}
                    >
                        {strings.applications.actionRun}
                    </Button>
                )}
                <IconButton
                    icon={<Bug size={13} />}
                    title={strings.applications.actionDebug}
                    onClick={e => { e.stopPropagation(); onDebug(); }}
                />
                <IconButton
                    icon={<Settings size={13} />}
                    title={strings.common.edit}
                    onClick={e => { e.stopPropagation(); onEdit(); }}
                />
            </div>
        </div>
    );
}

// -- Log Panel ----------------------------------------------------------------

function LogPanel({
    appId,
    appName,
    status,
    onClose,
}: {
    appId: string;
    appName: string;
    status: AppProcessStatus;
    onClose: () => void;
}) {
    const isActive = isActiveStatus(status);
    const hasStarted = status !== "idle";

    const statusBadge = !isActive && hasStarted ? (
        <span className={`text-[11px] font-medium ml-1 flex-shrink-0 ${status === "error" ? "text-red-400" :
            status === "exited" ? "text-text-dim/50 italic" :
                "text-orange-400"
            }`}>
            {status === "error" ? strings.applications.badgeErrored : status === "exited" ? strings.applications.badgeExited : statusLabel(status)}
        </span>
    ) : null;

    return (
        <div className="flex flex-col h-full bg-[#0a0c10] border-t border-border/20">
            {/* slim title strip */}
            <div className="flex items-center gap-2 px-4 h-8 border-b border-white/[0.06] bg-white/[0.02] flex-shrink-0">
                <Terminal size={12} className="text-text-dim/50" />
                <span className="text-xs font-semibold text-text-dim/70 uppercase tracking-wider truncate">
                    {strings.applications.logOutput.replace("{name}", appName)}
                </span>
                {statusBadge}
                <div className="flex-1" />
                <IconButton
                    icon={<X size={13} />}
                    className="w-5 h-5 border-0 bg-transparent"
                    onClick={onClose}
                    title={strings.applications.closeLogPanel}
                />
            </div>
            {/* content */}
            <div className="flex-1 overflow-hidden">
                {hasStarted ? (
                    <XtermLogViewer appId={appId} height={194} />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                        <Terminal size={20} className="text-text-dim/20" />
                        <span className="text-xs text-text-dim/30 font-mono">
                            {strings.applications.startToSeeOutput}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// -- Main Panel ---------------------------------------------------------------

interface Props {
    config: AppConfig;
    onAddMapping?: (target: string) => void;
}

export default function ApplicationsPanel({ config, onAddMapping }: Props) {
    const { confirm, ConfirmDialogElement } = useConfirmDialog();
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [states, setStates] = useState<Map<string, AppProcessState>>(new Map());
    const [formMode, setFormMode] = useState<null | "add" | "edit">(null);
    const [editTarget, setEditTarget] = useState<ApplicationConfig | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [detectedUrls, setDetectedUrls] = useState<Map<string, string>>(new Map());

    const wsId = config.activeWorkspaceId;
    const platform: string = (window.api as any).platform ?? "linux";

    const loadApps = useCallback(async () => {
        const list = await window.api.listApplications(wsId);
        setApps(list);
    }, [wsId]);

    const loadStates = useCallback(async () => {
        const allStates: AppProcessState[] = await window.api.getAllApplicationStates();
        const map = new Map<string, AppProcessState>();
        for (const s of allStates) map.set(s.appId, s);
        setStates(map);
    }, []);

    useEffect(() => { loadApps(); loadStates(); }, [loadApps, loadStates]);

    useEffect(() => {
        const unsub = window.api.onAppStatusChange((data: unknown) => {
            const d = data as AppProcessState;
            // Clear detected URL when app restarts
            if (d.status === "starting") {
                setDetectedUrls(prev => {
                    if (!prev.has(d.appId)) return prev;
                    const next = new Map(prev);
                    next.delete(d.appId);
                    return next;
                });
            }
            setStates((prev) => {
                const next = new Map(prev);
                next.set(d.appId, { ...prev.get(d.appId), ...d });
                return next;
            });
        });
        return () => { unsub(); };
    }, []);

    // Subscribe to live logs and scan for localhost URLs
    useEffect(() => {
        const unsub = window.api.onAppLog((raw: unknown) => {
            const chunk = raw as AppLogChunk;
            setDetectedUrls(prev => {
                if (prev.has(chunk.appId)) return prev;
                const url = extractFirstLocalhostUrl(chunk.data);
                if (!url) return prev;
                const next = new Map(prev);
                next.set(chunk.appId, url);
                return next;
            });
        });
        return () => unsub();
    }, []);

    // Scan historical logs for localhost URLs on mount / app list change
    useEffect(() => {
        for (const app of apps) {
            const appId = app.id;
            (window.api.getApplicationLogs(appId) as Promise<AppLogChunk[]>).then(chunks => {
                for (const chunk of (chunks ?? [])) {
                    const url = extractFirstLocalhostUrl(chunk.data);
                    if (url) {
                        setDetectedUrls(prev => {
                            if (prev.has(appId)) return prev;
                            const next = new Map(prev);
                            next.set(appId, url);
                            return next;
                        });
                        break;
                    }
                }
            });
        }
    }, [apps]);

    const handleSave = useCallback(async (app: ApplicationConfig) => {
        app.workspaceId = wsId;
        await window.api.saveApplication(app);
        setFormMode(null);
        setEditTarget(null);
        loadApps();
    }, [wsId, loadApps]);

    const handleDelete = useCallback(async (workspaceId: string, id: string) => {
        const ok = await confirm(strings.applications.confirmDelete);
        if (!ok) return;
        await window.api.deleteApplication(workspaceId, id);
        if (selected === id) setSelected(null);
        loadApps();
    }, [confirm, loadApps, selected]);

    const handleStart = useCallback(async (app: ApplicationConfig) => {
        await window.api.startApplication(wsId, app.id, "run");
        loadStates();
    }, [wsId, loadStates]);

    const handleDebug = useCallback(async (app: ApplicationConfig) => {
        await window.api.startApplication(wsId, app.id, "debug");
        loadStates();
    }, [wsId, loadStates]);

    const handleStop = useCallback(async (appId: string) => {
        await window.api.stopApplication(appId);
        loadStates();
    }, [loadStates]);

    const openAdd = () => { setFormMode("add"); setEditTarget(null); };
    const openEdit = (app: ApplicationConfig) => { setFormMode("edit"); setEditTarget(app); };
    const closeForm = () => { setFormMode(null); setEditTarget(null); };

    const s = strings.applications;

    // -- Form view --------------------------------------------------------------
    if (formMode) {
        return (
            <div className="flex flex-col flex-1 overflow-hidden">
                <AppConfigForm
                    initial={editTarget ?? undefined}
                    wsId={wsId}
                    platform={platform}
                    onSave={handleSave}
                    onCancel={closeForm}
                />
            </div>
        );
    }

    const selectedApp = selected ? apps.find(a => a.id === selected) ?? null : null;
    const selectedStatus: AppProcessStatus = selected
        ? (states.get(selected)?.status ?? "idle")
        : "idle";
    const selectedIsRunning = isActiveStatus(selectedStatus);

    // -- List view --------------------------------------------------------------
    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-border/20 flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-text-bright tracking-tight">{s.title}</h1>
                    <p className="text-sm text-text-dim mt-0.5">{s.subtitle}</p>
                </div>
                <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openAdd}>
                    {s.addApplication}
                </Button>
            </div>

            {/* Stats bar */}
            {apps.length > 0 && <StatsBar apps={apps} states={states} />}

            {/* Cards grid - scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {apps.length === 0 ? (
                    <EmptyState
                        icon={<Play size={24} />}
                        title={s.noTitle}
                        description={s.noDesc}
                        action={
                            <Button variant="primary" size="sm" icon={<Plus size={12} />} onClick={openAdd}>
                                {s.addApplication}
                            </Button>
                        }
                    />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-w-[1200px]">
                        {apps.map((app) => (
                            <AppCard
                                key={app.id}
                                app={app}
                                state={states.get(app.id) ?? null}
                                selected={selected === app.id}
                                onSelect={() => setSelected(prev => prev === app.id ? null : app.id)}
                                onStart={() => handleStart(app)}
                                onDebug={() => handleDebug(app)}
                                onStop={() => handleStop(app.id)}
                                onEdit={() => openEdit(app)}
                                onDelete={() => handleDelete(wsId, app.id)}
                                detectedUrl={detectedUrls.get(app.id)}
                                mappings={config.mappings ?? []}
                                serverPort={config.port}
                                onAddMapping={onAddMapping}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom log panel - shown when a card is selected */}
            {selected && selectedApp && (
                <div className="flex-shrink-0" style={{ height: 260 }}>
                    <LogPanel
                        appId={selected}
                        appName={selectedApp.name}
                        status={selectedStatus}
                        onClose={() => setSelected(null)}
                    />
                </div>
            )}
            {ConfirmDialogElement}
        </div>
    );
}
