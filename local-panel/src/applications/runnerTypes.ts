/**
 * Runner types — simplified run configuration for scripts and commands.
 */

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

export interface ShellConfig {
    scriptPath: string;
}

export interface BatConfig {
    scriptPath: string;
}

export interface NodeRunnerConfig {
    scriptPath: string;
    nodeFlags?: string;
}

export interface NpmRunnerConfig {
    scriptName: string;
    packageManager: "npm" | "yarn" | "pnpm" | "bun";
}

export interface PythonRunnerConfig {
    mode: "script" | "module";
    target: string;
}

export interface DockerRunnerConfig {
    mode: "image" | "build";
    image?: string;
    dockerfile?: string;
    ports?: string;
    volumes?: string;
    extraArgs?: string;
}

export interface DockerComposeRunnerConfig {
    composeFile?: string;
    services?: string;
    extraArgs?: string;
}

export interface RunnerConfig {
    id: string;
    name: string;
    type: RunnerType;
    workingDirectory: string;
    command?: string;
    args: string;
    preRunCommand?: string;
    folderId?: string | null;
    createdAt: number;
    workspaceId: string;
    shellConfig?: ShellConfig;
    batConfig?: BatConfig;
    nodeConfig?: NodeRunnerConfig;
    npmConfig?: NpmRunnerConfig;
    pythonConfig?: PythonRunnerConfig;
    dockerConfig?: DockerRunnerConfig;
    dockerComposeConfig?: DockerComposeRunnerConfig;
    resolvedCommand: string;
    resolvedCwd: string;
    resolvedEnv: Record<string, string>;
}

export type RunnerProcessStatus = "idle" | "starting" | "running" | "stopping" | "error" | "exited";

export interface RunnerProcessState {
    runnerId: string;
    status: RunnerProcessStatus;
    pid?: number;
    exitCode?: number | null;
    error?: string;
    startedAt?: number;
    stoppedAt?: number;
}

export interface RunnerLogChunk {
    runnerId: string;
    stream: "stdout" | "stderr" | "system";
    data: string;
    ts: number;
}

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

export const RUNNER_TYPE_ICONS: Record<RunnerType, string> = {
    command: "TerminalSquare",
    shell: "Terminal",
    bat: "FileText",
    powershell: "Terminal",
    node: "Hexagon",
    npm: "Package",
    python: "Code2",
    docker: "Container",
    "docker-compose": "Layers",
};
