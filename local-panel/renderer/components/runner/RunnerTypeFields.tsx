import React from "react";
import { Input, Select } from "@/components/ui";
import { Button } from "@/components/ui";
import { FolderSearch2 } from "@/lib/icons";
import { strings } from "@/lib/strings";
import type { RunnerConfig } from "@/types";

interface Props {
    runner: Partial<RunnerConfig>;
    onChange: (partial: Partial<RunnerConfig>) => void;
}

// Renders inside a CSS grid(grid-cols-2). Each child is either single-col or
// col-span-2 via the `full` prop on FieldRow (defined in RunnerTab). We inline
// the label+input here so RunnerTypeFields can participate in the parent grid
// without wrapping in an extra div.

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
    return (
        <div className={full ? "col-span-2" : ""}>
            <label className="block text-[11px] font-medium text-text-dim mb-1">{label}</label>
            {children}
        </div>
    );
}

async function pickFile(title: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
    const result = await window.api.pickFilePath(title, filters ?? [{ name: "All Files", extensions: ["*"] }]);
    return result ?? null;
}

export default function RunnerTypeFields({ runner, onChange }: Props) {
    const s = strings.runner;

    switch (runner.type) {
        case "command":
            return (
                <Field label={s.labelCommand} full>
                    <Input
                        value={runner.command ?? ""}
                        onChange={(e) => onChange({ command: e.target.value })}
                        placeholder={s.hintCommand}
                        inputSize="sm"
                    />
                </Field>
            );

        case "powershell":
            return (
                <Field label={s.labelCommand} full>
                    <Input
                        value={runner.command ?? ""}
                        onChange={(e) => onChange({ command: e.target.value })}
                        placeholder="script.ps1 or inline command"
                        inputSize="sm"
                    />
                </Field>
            );

        case "shell": {
            const scriptPath = runner.shellConfig?.scriptPath ?? "";
            return (
                <Field label={s.labelScriptPath} full>
                    <div className="flex gap-1">
                        <Input
                            value={scriptPath}
                            onChange={(e) => onChange({ shellConfig: { scriptPath: e.target.value } })}
                            placeholder="script.sh"
                            className="flex-1"
                            inputSize="sm"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={<FolderSearch2 size={12} />}
                            onClick={async () => {
                                const p = await pickFile(s.filterShellScripts, [{ name: s.filterShellScripts, extensions: ["sh", "bash", "zsh"] }, { name: s.filterAllFiles, extensions: ["*"] }]);
                                if (p) onChange({ shellConfig: { scriptPath: p } });
                            }}
                        >{s.browse}</Button>
                    </div>
                </Field>
            );
        }

        case "bat": {
            const scriptPath = runner.batConfig?.scriptPath ?? "";
            return (
                <Field label={s.labelScriptPath} full>
                    <div className="flex gap-1">
                        <Input
                            value={scriptPath}
                            onChange={(e) => onChange({ batConfig: { scriptPath: e.target.value } })}
                            placeholder="script.bat"
                            className="flex-1"
                            inputSize="sm"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={<FolderSearch2 size={12} />}
                            onClick={async () => {
                                const p = await pickFile(s.filterBatchFiles, [{ name: s.filterBatchFiles, extensions: ["bat", "cmd"] }, { name: s.filterAllFiles, extensions: ["*"] }]);
                                if (p) onChange({ batConfig: { scriptPath: p } });
                            }}
                        >{s.browse}</Button>
                    </div>
                </Field>
            );
        }

        case "node": {
            const cfg = runner.nodeConfig ?? { scriptPath: "" };
            return (
                <>
                    <Field label={s.labelScriptPath} full>
                        <div className="flex gap-1">
                            <Input
                                value={cfg.scriptPath}
                                onChange={(e) => onChange({ nodeConfig: { ...cfg, scriptPath: e.target.value } })}
                                placeholder="index.js"
                                className="flex-1"
                                inputSize="sm"
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={<FolderSearch2 size={12} />}
                                onClick={async () => {
                                    const p = await pickFile(s.filterJavaScript, [{ name: s.filterJavaScript, extensions: ["js", "mjs", "cjs", "ts"] }, { name: s.filterAllFiles, extensions: ["*"] }]);
                                    if (p) onChange({ nodeConfig: { ...cfg, scriptPath: p } });
                                }}
                            >{s.browse}</Button>
                        </div>
                    </Field>
                    <Field label={s.labelNodeFlags}>
                        <Input
                            value={cfg.nodeFlags ?? ""}
                            onChange={(e) => onChange({ nodeConfig: { ...cfg, nodeFlags: e.target.value } })}
                            placeholder={s.hintNodeFlags}
                            inputSize="sm"
                        />
                    </Field>
                </>
            );
        }

        case "npm": {
            const cfg = runner.npmConfig ?? { scriptName: "start", packageManager: "npm" };
            return (
                <>
                    <Field label={s.labelScriptName}>
                        <Input
                            value={cfg.scriptName}
                            onChange={(e) => onChange({ npmConfig: { ...cfg, scriptName: e.target.value } })}
                            placeholder={s.hintScriptName}
                            inputSize="sm"
                        />
                    </Field>
                    <Field label={s.labelPackageManager}>
                        <Select
                            value={cfg.packageManager}
                            onChange={(e) => onChange({ npmConfig: { ...cfg, packageManager: e.target.value as any } })}
                            inputSize="sm"
                            className="w-full"
                        >
                            <option value="npm">npm</option>
                            <option value="yarn">yarn</option>
                            <option value="pnpm">pnpm</option>
                            <option value="bun">bun</option>
                        </Select>
                    </Field>
                </>
            );
        }

        case "python": {
            const cfg = runner.pythonConfig ?? { mode: "script", target: "" };
            return (
                <>
                    <Field label={s.labelMode}>
                        <Select
                            value={cfg.mode}
                            onChange={(e) => onChange({ pythonConfig: { ...cfg, mode: e.target.value as "script" | "module" } })}
                            inputSize="sm"
                            className="w-full"
                        >
                            <option value="script">{s.modeScript}</option>
                            <option value="module">{s.modeModule}</option>
                        </Select>
                    </Field>
                    <Field label={s.labelTarget}>
                        {cfg.mode === "script" ? (
                            <div className="flex gap-1">
                                <Input
                                    value={cfg.target}
                                    onChange={(e) => onChange({ pythonConfig: { ...cfg, target: e.target.value } })}
                                    placeholder="main.py"
                                    className="flex-1"
                                    inputSize="sm"
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<FolderSearch2 size={12} />}
                                    onClick={async () => {
                                        const p = await pickFile(s.filterPythonFiles, [{ name: s.filterPythonFiles, extensions: ["py"] }, { name: s.filterAllFiles, extensions: ["*"] }]);
                                        if (p) onChange({ pythonConfig: { ...cfg, target: p } });
                                    }}
                                >{s.browse}</Button>
                            </div>
                        ) : (
                            <Input
                                value={cfg.target}
                                onChange={(e) => onChange({ pythonConfig: { ...cfg, target: e.target.value } })}
                                placeholder="uvicorn.main"
                                inputSize="sm"
                            />
                        )}
                    </Field>
                </>
            );
        }

        case "docker": {
            const cfg = runner.dockerConfig ?? { mode: "image" };
            return (
                <>
                    <Field label={s.labelMode}>
                        <Select
                            value={cfg.mode}
                            onChange={(e) => onChange({ dockerConfig: { ...cfg, mode: e.target.value as "image" | "build" } })}
                            inputSize="sm"
                            className="w-full"
                        >
                            <option value="image">{s.modeImage}</option>
                            <option value="build">{s.modeBuild}</option>
                        </Select>
                    </Field>
                    {cfg.mode === "image" ? (
                        <Field label={s.labelImage}>
                            <Input
                                value={cfg.image ?? ""}
                                onChange={(e) => onChange({ dockerConfig: { ...cfg, image: e.target.value } })}
                                placeholder="nginx:latest"
                                inputSize="sm"
                            />
                        </Field>
                    ) : (
                        <Field label={s.labelDockerfile}>
                            <div className="flex gap-1">
                                <Input
                                    value={cfg.dockerfile ?? ""}
                                    onChange={(e) => onChange({ dockerConfig: { ...cfg, dockerfile: e.target.value } })}
                                    placeholder="Dockerfile"
                                    className="flex-1"
                                    inputSize="sm"
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<FolderSearch2 size={12} />}
                                    onClick={async () => {
                                        const p = await pickFile(s.filterDockerfile, [{ name: s.filterDockerfile, extensions: ["*"] }]);
                                        if (p) onChange({ dockerConfig: { ...cfg, dockerfile: p } });
                                    }}
                                >{s.browse}</Button>
                            </div>
                        </Field>
                    )}
                    <Field label={s.labelPorts}>
                        <Input
                            value={cfg.ports ?? ""}
                            onChange={(e) => onChange({ dockerConfig: { ...cfg, ports: e.target.value } })}
                            placeholder={s.hintPortMappings}
                            inputSize="sm"
                        />
                    </Field>
                    <Field label={s.labelVolumes}>
                        <Input
                            value={cfg.volumes ?? ""}
                            onChange={(e) => onChange({ dockerConfig: { ...cfg, volumes: e.target.value } })}
                            placeholder={s.hintVolumes}
                            inputSize="sm"
                        />
                    </Field>
                    <Field label={s.labelExtraArgs} full>
                        <Input
                            value={cfg.extraArgs ?? ""}
                            onChange={(e) => onChange({ dockerConfig: { ...cfg, extraArgs: e.target.value } })}
                            placeholder={s.hintExtraArgs}
                            inputSize="sm"
                        />
                    </Field>
                </>
            );
        }

        case "docker-compose": {
            const cfg = runner.dockerComposeConfig ?? {};
            return (
                <>
                    <Field label={s.labelComposeFile} full>
                        <div className="flex gap-1">
                            <Input
                                value={cfg.composeFile ?? ""}
                                onChange={(e) => onChange({ dockerComposeConfig: { ...cfg, composeFile: e.target.value } })}
                                placeholder="docker-compose.yml"
                                className="flex-1"
                                inputSize="sm"
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={<FolderSearch2 size={12} />}
                                onClick={async () => {
                                    const p = await pickFile(s.filterComposeFiles, [{ name: s.filterComposeFiles, extensions: ["yml", "yaml"] }, { name: s.filterAllFiles, extensions: ["*"] }]);
                                    if (p) onChange({ dockerComposeConfig: { ...cfg, composeFile: p } });
                                }}
                            >{s.browse}</Button>
                        </div>
                    </Field>
                    <Field label={s.labelServices}>
                        <Input
                            value={cfg.services ?? ""}
                            onChange={(e) => onChange({ dockerComposeConfig: { ...cfg, services: e.target.value } })}
                            placeholder={s.hintServices}
                            inputSize="sm"
                        />
                    </Field>
                    <Field label={s.labelExtraArgs}>
                        <Input
                            value={cfg.extraArgs ?? ""}
                            onChange={(e) => onChange({ dockerComposeConfig: { ...cfg, extraArgs: e.target.value } })}
                            placeholder={s.hintExtraArgs}
                            inputSize="sm"
                        />
                    </Field>
                </>
            );
        }

        default:
            return null;
    }
}
