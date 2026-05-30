import { describe, it, expect } from "vitest";
import {
    statusColor,
    statusDotColor,
    statusLabel,
    isActiveStatus,
    RUN_CONFIG_TYPE_LABELS,
    RUN_CONFIG_TYPE_INFOS,
    getAvailableTypeInfos,
    CATEGORY_LABELS,
    type RunConfigType,
    type AppProcessStatus,
} from "@/lib/applicationUtils";

describe("renderer/lib/applicationUtils.ts", () => {
    // ── statusColor() ──────────────────────────────────────────────────────────

    describe("statusColor()", () => {
        it("returns green for running", () => {
            expect(statusColor("running")).toBe("text-green-400");
        });

        it("returns blue for debugging", () => {
            expect(statusColor("debugging")).toBe("text-blue-400");
        });

        it("returns yellow for starting", () => {
            expect(statusColor("starting")).toBe("text-yellow-400");
        });

        it("returns yellow for stopping", () => {
            expect(statusColor("stopping")).toBe("text-yellow-400");
        });

        it("returns red for error", () => {
            expect(statusColor("error")).toBe("text-red-400");
        });

        it("returns dim for exited", () => {
            expect(statusColor("exited")).toBe("text-text-dim");
        });

        it("returns dim for idle (default)", () => {
            expect(statusColor("idle")).toBe("text-text-dim");
        });
    });

    // ── statusLabel() ──────────────────────────────────────────────────────────

    describe("statusLabel()", () => {
        const cases: Array<[AppProcessStatus, string]> = [
            ["running", "Running"],
            ["debugging", "Debugging"],
            ["starting", "Starting\u2026"],
            ["stopping", "Stopping\u2026"],
            ["error", "Error"],
            ["exited", "Exited"],
            ["idle", "Idle"],
        ];

        for (const [status, expected] of cases) {
            it(`returns "${expected}" for status "${status}"`, () => {
                expect(statusLabel(status)).toBe(expected);
            });
        }
    });

    // ── isActiveStatus() ───────────────────────────────────────────────────────

    describe("isActiveStatus()", () => {
        it("returns true for running", () => {
            expect(isActiveStatus("running")).toBe(true);
        });

        it("returns true for debugging", () => {
            expect(isActiveStatus("debugging")).toBe(true);
        });

        it("returns true for starting", () => {
            expect(isActiveStatus("starting")).toBe(true);
        });

        it("returns false for idle", () => {
            expect(isActiveStatus("idle")).toBe(false);
        });

        it("returns false for stopping", () => {
            expect(isActiveStatus("stopping")).toBe(false);
        });

        it("returns false for error", () => {
            expect(isActiveStatus("error")).toBe(false);
        });

        it("returns false for exited", () => {
            expect(isActiveStatus("exited")).toBe(false);
        });
    });

    // ── RUN_CONFIG_TYPE_LABELS ─────────────────────────────────────────────────

    describe("RUN_CONFIG_TYPE_LABELS", () => {
        const EXPECTED_TYPES: RunConfigType[] = [
            "shell", "node", "npm", "python", "java", "dotnet",
            "go", "docker", "docker-compose", "maven", "gradle", "spring-boot",
            "bat", "powershell", "vbs",
        ];

        it("has a non-empty label for every RunConfigType", () => {
            for (const type of EXPECTED_TYPES) {
                const label = RUN_CONFIG_TYPE_LABELS[type];
                expect(typeof label).toBe("string");
                expect(label.length).toBeGreaterThan(0);
            }
        });

        it("covers exactly 15 types (including Windows-only)", () => {
            expect(Object.keys(RUN_CONFIG_TYPE_LABELS)).toHaveLength(15);
        });

        it("maps shell to 'Shell Script'", () => {
            expect(RUN_CONFIG_TYPE_LABELS.shell).toBe("Shell Script");
        });

        it("maps bat to 'Batch File'", () => {
            expect(RUN_CONFIG_TYPE_LABELS.bat).toBe("Batch File");
        });

        it("maps docker-compose correctly", () => {
            expect(RUN_CONFIG_TYPE_LABELS["docker-compose"]).toBe("Docker Compose");
        });

        it("maps spring-boot correctly", () => {
            expect(RUN_CONFIG_TYPE_LABELS["spring-boot"]).toBe("Spring Boot");
        });
    });

    // ── statusDotColor() ───────────────────────────────────────────────────────

    describe("statusDotColor()", () => {
        it("returns green bg for running", () => {
            expect(statusDotColor("running")).toBe("bg-green-400");
        });
        it("returns blue bg for debugging", () => {
            expect(statusDotColor("debugging")).toBe("bg-blue-400");
        });
        it("returns yellow bg for starting", () => {
            expect(statusDotColor("starting")).toBe("bg-yellow-400");
        });
        it("returns dim for idle", () => {
            expect(statusDotColor("idle")).toBe("bg-text-dim/30");
        });
    });

    // ── getAvailableTypeInfos() ────────────────────────────────────────────────

    describe("getAvailableTypeInfos()", () => {
        it("excludes Windows-only types on linux", () => {
            const types = getAvailableTypeInfos("linux").map(i => i.type);
            expect(types).not.toContain("bat");
            expect(types).not.toContain("powershell");
            expect(types).not.toContain("vbs");
        });

        it("includes Windows-only types on win32", () => {
            const types = getAvailableTypeInfos("win32").map(i => i.type);
            expect(types).toContain("bat");
            expect(types).toContain("powershell");
            expect(types).toContain("vbs");
        });

        it("always includes cross-platform types", () => {
            const crossPlatform: RunConfigType[] = ["shell", "node", "npm", "python", "java", "dotnet", "go", "docker", "docker-compose", "maven", "gradle", "spring-boot"];
            for (const platform of ["linux", "darwin", "win32"]) {
                const types = getAvailableTypeInfos(platform).map(i => i.type);
                for (const t of crossPlatform) {
                    expect(types).toContain(t);
                }
            }
        });
    });

    // ── RUN_CONFIG_TYPE_INFOS ─────────────────────────────────────────────────

    describe("RUN_CONFIG_TYPE_INFOS", () => {
        it("every entry has iconName, iconColor, category", () => {
            for (const info of RUN_CONFIG_TYPE_INFOS) {
                expect(typeof info.iconName).toBe("string");
                expect(typeof info.iconColor).toBe("string");
                expect(typeof info.category).toBe("string");
            }
        });
    });

    // ── CATEGORY_LABELS ────────────────────────────────────────────────────────

    describe("CATEGORY_LABELS", () => {
        it("has a label for every category", () => {
            const categories = ["scripts", "node", "jvm", "python", "system", "containers"] as const;
            for (const cat of categories) {
                expect(typeof CATEGORY_LABELS[cat]).toBe("string");
                expect(CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
            }
        });
    });
});
