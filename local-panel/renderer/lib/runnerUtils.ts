import type React from "react";
import type { RunnerProcessStatus } from "@/types";
import { TerminalSquare, Terminal, FileText, Zap, Hexagon, Package, Code2, Box, Server } from "@/lib/icons";

export type RunnerType =
    | "command"
    | "shell"
    | "bat"
    | "powershell"
    | "node"
    | "npm"
    | "python"
    | "docker"
    | "docker-compose";

export const RUNNER_TYPE_LABELS: Record<RunnerType, string> = {
    command: "Command",
    shell: "Shell Script",
    bat: "Batch File",
    powershell: "PowerShell",
    node: "Node.js",
    npm: "NPM Script",
    python: "Python",
    docker: "Docker",
    "docker-compose": "Docker Compose",
};

export const RUNNER_TYPE_ICONS: Record<RunnerType, React.ComponentType<{ size?: number; className?: string }>> = {
    command: TerminalSquare,
    shell: Terminal,
    bat: FileText,
    powershell: Zap,
    node: Hexagon,
    npm: Package,
    python: Code2,
    docker: Box,
    "docker-compose": Server,
};

export interface RunnerTypeInfo {
    type: RunnerType;
    label: string;
    category: string;
    windowsOnly?: boolean;
}

export const RUNNER_TYPES: RunnerTypeInfo[] = [
    { type: "command", label: "Command", category: "General" },
    { type: "shell", label: "Shell Script", category: "Scripts" },
    { type: "bat", label: "Batch File", category: "Scripts", windowsOnly: true },
    { type: "powershell", label: "PowerShell", category: "Scripts" },
    { type: "node", label: "Node.js", category: "JavaScript" },
    { type: "npm", label: "NPM Script", category: "JavaScript" },
    { type: "python", label: "Python", category: "Python" },
    { type: "docker", label: "Docker", category: "Containers" },
    { type: "docker-compose", label: "Docker Compose", category: "Containers" },
];

export function getStatusColor(status: RunnerProcessStatus | undefined): "green" | "red" | "yellow" | "dim" | "accent" {
    switch (status) {
        case "running": return "green";
        case "error": return "red";
        case "starting":
        case "stopping": return "yellow";
        case "exited": return "dim";
        default: return "dim";
    }
}

export function getStatusLabel(status: RunnerProcessStatus | undefined, strings: any): string {
    switch (status) {
        case "running": return strings.runner.statusRunning;
        case "starting": return strings.runner.statusStarting;
        case "stopping": return strings.runner.statusStopping;
        case "error": return strings.runner.statusError;
        case "exited": return strings.runner.statusExited;
        default: return strings.runner.statusIdle;
    }
}
