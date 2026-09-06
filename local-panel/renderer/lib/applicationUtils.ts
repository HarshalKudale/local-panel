/**
 * Utility functions for the Applications panel.
 * Kept in a separate file so they can be independently tested.
 */

import { strings } from "@/lib/strings";

export type RunConfigType =
    | "shell" | "node" | "npm" | "python" | "java" | "dotnet"
    | "go" | "docker" | "docker-compose" | "maven" | "gradle" | "spring-boot"
    | "bat" | "powershell" | "vbs";

export type AppProcessStatus =
    | "idle" | "starting" | "running" | "debugging" | "stopping" | "error" | "exited";

export type RunConfigCategory = "scripts" | "node" | "jvm" | "python" | "system" | "containers";

export interface RunConfigTypeInfo {
    type: RunConfigType;
    label: string;
    /** Icon name key (matches export name in icons.tsx) */
    iconName: string;
    /** Tailwind color class for the icon */
    iconColor: string;
    category: RunConfigCategory;
    /** If set, only available on that OS platform string */
    osOnly?: "win32";
}

// -- Type registry -------------------------------------------------------------

export const RUN_CONFIG_TYPE_INFOS: RunConfigTypeInfo[] = [
    // Scripts
    { type: "shell", label: "Shell Script", iconName: "Terminal", iconColor: "text-muted-foreground", category: "scripts" },
    { type: "bat", label: "Batch File", iconName: "FileText", iconColor: "text-yellow-400", category: "scripts", osOnly: "win32" },
    { type: "powershell", label: "PowerShell", iconName: "Terminal", iconColor: "text-blue-400", category: "scripts", osOnly: "win32" },
    { type: "vbs", label: "VBScript", iconName: "FileCode", iconColor: "text-purple-400", category: "scripts", osOnly: "win32" },
    // Node ecosystem
    { type: "node", label: "Node.js", iconName: "Braces", iconColor: "text-green-400", category: "node" },
    { type: "npm", label: "NPM Script", iconName: "Package", iconColor: "text-red-400", category: "node" },
    // JVM
    { type: "java", label: "Java", iconName: "Cpu", iconColor: "text-orange-400", category: "jvm" },
    { type: "spring-boot", label: "Spring Boot", iconName: "Leaf", iconColor: "text-green-500", category: "jvm" },
    { type: "maven", label: "Maven", iconName: "Package2", iconColor: "text-red-500", category: "jvm" },
    { type: "gradle", label: "Gradle", iconName: "Hammer", iconColor: "text-blue-400", category: "jvm" },
    // Other languages
    { type: "python", label: "Python", iconName: "Code2", iconColor: "text-yellow-400", category: "python" },
    { type: "dotnet", label: ".NET", iconName: "Server", iconColor: "text-purple-400", category: "system" },
    { type: "go", label: "Go", iconName: "Gauge", iconColor: "text-cyan-400", category: "system" },
    // Containers
    { type: "docker", label: "Docker", iconName: "Box", iconColor: "text-blue-500", category: "containers" },
    { type: "docker-compose", label: "Docker Compose", iconName: "Layers", iconColor: "text-blue-400", category: "containers" },
];

// -- Derived maps (kept for backward compat) -----------------------------------

export const RUN_CONFIG_TYPE_LABELS: Record<RunConfigType, string> = Object.fromEntries(
    RUN_CONFIG_TYPE_INFOS.map(info => [info.type, info.label])
) as Record<RunConfigType, string>;

/** Returns the types available on the given platform (process.platform value). */
export function getAvailableTypeInfos(platform: string): RunConfigTypeInfo[] {
    return RUN_CONFIG_TYPE_INFOS.filter(info => !info.osOnly || info.osOnly === platform);
}

/** Returns category label for display. */
export const CATEGORY_LABELS: Record<RunConfigCategory, string> = {
    scripts: "Scripts",
    node: "Node.js",
    jvm: "JVM",
    python: "Python",
    system: "System",
    containers: "Containers",
};

// -- Status helpers ------------------------------------------------------------

/** Returns a Tailwind text-color class for the given process status. */
export function statusColor(status: AppProcessStatus): string {
    switch (status) {
        case "running": return "text-green-400";
        case "debugging": return "text-blue-400";
        case "starting":
        case "stopping": return "text-yellow-400";
        case "error": return "text-red-400";
        case "exited": return "text-muted-foreground";
        default: return "text-muted-foreground";
    }
}

/** Returns the bg-color ring class for status indicator dot. */
export function statusDotColor(status: AppProcessStatus): string {
    switch (status) {
        case "running": return "bg-green-400";
        case "debugging": return "bg-blue-400";
        case "starting":
        case "stopping": return "bg-yellow-400";
        case "error": return "bg-red-400";
        default: return "bg-text-dim/30";
    }
}

/** Returns a human-readable label for the given process status. */
export function statusLabel(status: AppProcessStatus): string {
    switch (status) {
        case "running": return strings.applications.statusRunning;
        case "debugging": return strings.applications.statusDebugging;
        case "starting": return strings.applications.statusStarting;
        case "stopping": return strings.applications.statusStopping;
        case "error": return strings.applications.statusError;
        case "exited": return strings.applications.statusExited;
        default: return strings.applications.statusIdle;
    }
}

/** Returns true when the process should be considered active (running/starting/debugging). */
export function isActiveStatus(status: AppProcessStatus): boolean {
    return status === "running" || status === "debugging" || status === "starting";
}
