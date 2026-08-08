/**
 * Runner Command Generator — computes the shell command at save time.
 */

import { RunnerConfig } from "./runnerTypes";

export interface ResolvedRunnerCommand {
    resolvedCommand: string;
    resolvedCwd: string;
    resolvedEnv: Record<string, string>;
}

function withPreRun(preRun: string | undefined, main: string): string {
    if (!preRun || !preRun.trim()) return main;
    return `${preRun.trim()} && ${main}`;
}

export function generateRunnerCommand(
    config: RunnerConfig,
    platform: string = process.platform,
): ResolvedRunnerCommand {
    const args = config.args?.trim() || "";
    const cwd = config.workingDirectory || ".";
    const isWin = platform === "win32";

    let command = "";
    const env: Record<string, string> = {};

    switch (config.type) {
        case "command": {
            command = config.command || "";
            if (args) command += ` ${args}`;
            break;
        }

        case "shell": {
            const script = config.shellConfig?.scriptPath || "";
            command = script;
            if (args) command += ` ${args}`;
            break;
        }

        case "bat": {
            const script = config.batConfig?.scriptPath || "";
            command = script;
            if (args) command += ` ${args}`;
            break;
        }

        case "powershell": {
            const cmd = config.command || "";
            if (cmd.endsWith(".ps1")) {
                command = `powershell -ExecutionPolicy Bypass -File "${cmd}"`;
            } else {
                command = `powershell -Command "${cmd}"`;
            }
            if (args) command += ` ${args}`;
            break;
        }

        case "node": {
            const cfg = config.nodeConfig;
            const scriptPath = cfg?.scriptPath || "index.js";
            const parts = ["node"];
            if (cfg?.nodeFlags) parts.push(cfg.nodeFlags);
            parts.push(scriptPath);
            if (args) parts.push(args);
            command = parts.join(" ");
            break;
        }

        case "npm": {
            const cfg = config.npmConfig;
            const pm = cfg?.packageManager ?? "npm";
            const script = cfg?.scriptName ?? "start";

            if (pm === "yarn") {
                command = `yarn ${script}`;
            } else if (pm === "pnpm") {
                command = `pnpm run ${script}`;
            } else if (pm === "bun") {
                command = `bun run ${script}`;
            } else {
                command = `npm run ${script}`;
            }
            if (args) command += ` ${args}`;
            break;
        }

        case "python": {
            const cfg = config.pythonConfig;
            const parts = ["python"];
            if (cfg?.mode === "module") {
                parts.push("-m", cfg.target || "");
            } else {
                parts.push(cfg?.target || "main.py");
            }
            if (args) parts.push(args);
            command = parts.join(" ");
            break;
        }

        case "docker": {
            const cfg = config.dockerConfig;
            if (cfg?.mode === "build" && cfg.dockerfile) {
                const buildCmd = `docker build -f ${cfg.dockerfile} -t _localpanel_build .`;
                let runCmd = "docker run --rm";
                if (cfg.ports) runCmd += ` ${cfg.ports.split("\n").filter(Boolean).map(p => `-p ${p}`).join(" ")}`;
                if (cfg.volumes) runCmd += ` ${cfg.volumes.split("\n").filter(Boolean).map(v => `-v ${v}`).join(" ")}`;
                if (cfg.extraArgs) runCmd += ` ${cfg.extraArgs}`;
                runCmd += " _localpanel_build";
                if (args) runCmd += ` ${args}`;
                command = `${buildCmd} && ${runCmd}`;
            } else {
                const parts = ["docker", "run", "--rm"];
                if (cfg?.ports) cfg.ports.split("\n").filter(Boolean).forEach(p => parts.push("-p", p));
                if (cfg?.volumes) cfg.volumes.split("\n").filter(Boolean).forEach(v => parts.push("-v", v));
                if (cfg?.extraArgs) parts.push(cfg.extraArgs);
                if (cfg?.image) parts.push(cfg.image);
                if (args) parts.push(args);
                command = parts.join(" ");
            }
            break;
        }

        case "docker-compose": {
            const cfg = config.dockerComposeConfig;
            const file = cfg?.composeFile || "docker-compose.yml";
            const parts = ["docker", "compose", "-f", file, "up"];
            if (cfg?.services) parts.push(cfg.services);
            if (cfg?.extraArgs) parts.push(cfg.extraArgs);
            if (args) parts.push(args);
            command = parts.join(" ");
            break;
        }

        default:
            command = config.command || "";
            break;
    }

    const finalCommand = withPreRun(config.preRunCommand, command);

    return {
        resolvedCommand: finalCommand,
        resolvedCwd: cwd,
        resolvedEnv: env,
    };
}
