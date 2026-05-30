import React, { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Button } from "@/components/ui";
import { Trash2, ArrowDown } from "@/lib/icons";
import { strings } from "@/lib/strings";

interface AppLogChunk {
    appId: string;
    stream: "stdout" | "stderr" | "system";
    data: string;
    ts: number;
}

interface Props {
    appId: string;
    height?: number;
}

/** xterm.js-based log viewer with selectable text, clickable URLs, and proper ANSI rendering. */
export default function XtermLogViewer({ appId, height = 280 }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<XTerm | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const autoScrollRef = useRef(true);

    // Write a chunk to the terminal with stream-appropriate coloring
    const writeChunk = useCallback((term: XTerm, chunk: AppLogChunk) => {
        let data = chunk.data;
        // Normalise bare \n → \r\n for proper xterm rendering
        data = data.replace(/\r?\n/g, "\r\n");

        if (chunk.stream === "stderr") {
            term.write("\x1b[31m" + data + "\x1b[0m");
        } else if (chunk.stream === "system") {
            term.write("\x1b[34m" + data + "\x1b[0m");
        } else {
            term.write(data);
        }
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        const term = new XTerm({
            convertEol: false,
            disableStdin: true,
            scrollback: 10000,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace",
            fontSize: 12,
            lineHeight: 1.4,
            cursorStyle: "bar",
            cursorBlink: false,
            theme: {
                background: "#0a0c10",
                foreground: "#d1d5db",
                black: "#1f2937",
                red: "#f87171",
                green: "#86efac",
                yellow: "#fde68a",
                blue: "#93c5fd",
                magenta: "#c084fc",
                cyan: "#67e8f9",
                white: "#f3f4f6",
                brightBlack: "#4b5563",
                brightRed: "#fca5a5",
                brightGreen: "#bbf7d0",
                brightYellow: "#fef3c7",
                brightBlue: "#bfdbfe",
                brightMagenta: "#e9d5ff",
                brightCyan: "#a5f3fc",
                brightWhite: "#ffffff",
                selectionBackground: "#264f78",
                cursor: "#58a6ff",
            },
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon((_evt, uri) => {
            window.open(uri, "_blank");
        });

        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);
        term.open(containerRef.current);

        // Attempt fit after mount
        requestAnimationFrame(() => {
            try { fitAddon.fit(); } catch { /* ignore */ }
        });

        termRef.current = term;
        fitRef.current = fitAddon;

        // Load existing logs
        window.api.getApplicationLogs(appId).then((existing: AppLogChunk[]) => {
            if (!termRef.current) return;
            for (const chunk of (existing ?? [])) {
                writeChunk(termRef.current, chunk);
            }
            if (autoScrollRef.current) {
                termRef.current.scrollToBottom();
            }
        });

        // Live log subscription
        const unsub = window.api.onAppLog((raw: unknown) => {
            const chunk = raw as AppLogChunk;
            if (chunk.appId !== appId || !termRef.current) return;
            writeChunk(termRef.current, chunk);
            if (autoScrollRef.current) {
                termRef.current.scrollToBottom();
            }
        });

        // Resize observer to fit terminal to container
        const ro = new ResizeObserver(() => {
            if (!fitRef.current) return;
            try { fitRef.current.fit(); } catch { /* ignore */ }
        });
        ro.observe(containerRef.current);

        return () => {
            unsub();
            ro.disconnect();
            term.dispose();
            termRef.current = null;
            fitRef.current = null;
        };
    }, [appId, writeChunk]);

    const handleClear = () => {
        termRef.current?.clear();
        termRef.current?.reset();
    };

    const handleScrollToBottom = () => {
        termRef.current?.scrollToBottom();
        autoScrollRef.current = true;
    };

    return (
        <div className="flex flex-col gap-1">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-1">
                <span className="text-xs text-text-dim font-mono">
                    {strings.applications.logsTitle}
                </span>
                <div className="flex gap-1">
                    <Button variant="ghost" size="sm" icon={<ArrowDown size={11} />} onClick={handleScrollToBottom}>
                        {strings.applications.logsScrollBottom}
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Trash2 size={11} />} onClick={handleClear}>
                        {strings.applications.logsClear}
                    </Button>
                </div>
            </div>
            {/* Terminal container — must have explicit height for xterm */}
            <div
                ref={containerRef}
                className="rounded overflow-hidden border border-border/20"
                style={{ height, background: "#0a0c10" }}
            />
        </div>
    );
}
