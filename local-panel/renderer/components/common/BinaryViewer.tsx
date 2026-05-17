import React, { useState, useCallback } from "react";
import { isImageContentType, getImageDataUrl, formatBytes } from "@/lib/bodyUtils";
import { Upload } from "@/lib/icons";

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

interface Props {
    /** Base64-encoded binary data */
    data: string;
    /** MIME type of the data */
    contentType: string;
    /** Allow replacing the data */
    editable?: boolean;
    /** Called with base64 string when data is replaced */
    onChange?: (base64: string) => void;
}

function hexDump(base64: string, maxBytes: number = 4096): string {
    // Sanitize base64 string: remove whitespace and validate
    const sanitized = base64.replace(/\s/g, '');
    if (!sanitized) return '';
    try {
        const bytes = Uint8Array.from(atob(sanitized.slice(0, Math.ceil(maxBytes * 4 / 3))), c => c.charCodeAt(0));
        const lines: string[] = [];
        for (let i = 0; i < Math.min(bytes.length, maxBytes); i += 16) {
            const hex = Array.from(bytes.slice(i, i + 16))
                .map(b => b.toString(16).padStart(2, "0"))
                .join(" ");
            const ascii = Array.from(bytes.slice(i, i + 16))
                .map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : ".")
                .join("");
            const offset = i.toString(16).padStart(8, "0");
            lines.push(`${offset}  ${hex.padEnd(48)}  ${ascii}`);
        }
        if (bytes.length > maxBytes) {
            lines.push(`... (${formatBytes(bytes.length)} total)`);
        }
        return lines.join("\n");
    } catch (e) {
        return `Error decoding base64: ${e instanceof Error ? e.message : 'Invalid format'}`;
    }
}

export default function BinaryViewer({ data, contentType, editable = false, onChange }: Props) {
    const [viewMode, setViewMode] = useState<"preview" | "hex" | "base64">(
        isImageContentType(contentType) ? "preview" : "hex"
    );
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const isImage = isImageContentType(contentType);
    const dataSize = data ? Math.ceil(data.length * 3 / 4) : 0;

    const handleFilePick = useCallback(async () => {
        setError(null);
        try {
            const result = await (window as any).api.openFileDialog();
            if (!result) return;
            if (result.size > MAX_FILE_SIZE) {
                setError(`File too large (${formatBytes(result.size)}). Max: 1 MB`);
                return;
            }
            onChange?.(result.base64);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to open file");
        }
    }, [onChange]);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        setError(null);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) {
            setError(`File too large (${formatBytes(file.size)}). Max: 1 MB`);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1] ?? "";
            onChange?.(base64);
        };
        reader.readAsDataURL(file);
    }, [onChange]);

    const handleCopyBase64 = useCallback(() => {
        navigator.clipboard.writeText(data);
    }, [data]);

    return (
        <div
            className={`flex flex-col flex-1 overflow-hidden ${dragOver ? "ring-2 ring-accent ring-inset" : ""}`}
            onDragOver={(e) => { if (editable) { e.preventDefault(); setDragOver(true); } }}
            onDragLeave={() => setDragOver(false)}
            onDrop={editable ? handleDrop : undefined}
        >
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-bg0/20 flex-shrink-0">
                <div className="flex items-center gap-0.5">
                    {isImage && (
                        <button
                            onClick={() => setViewMode("preview")}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${viewMode === "preview" ? "bg-accent/20 text-accent" : "text-text-dim hover:text-text-base"
                                }`}
                        >Preview</button>
                    )}
                    <button
                        onClick={() => setViewMode("hex")}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${viewMode === "hex" ? "bg-accent/20 text-accent" : "text-text-dim hover:text-text-base"
                            }`}
                    >Hex</button>
                    <button
                        onClick={() => setViewMode("base64")}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${viewMode === "base64" ? "bg-accent/20 text-accent" : "text-text-dim hover:text-text-base"
                            }`}
                    >Base64</button>
                </div>

                <div className="flex-1" />

                <span className="text-[10px] text-text-dim font-mono">{contentType}</span>
                <span className="text-[10px] text-text-dim font-mono">{formatBytes(dataSize)}</span>

                <button
                    onClick={handleCopyBase64}
                    className="text-[10px] text-text-dim hover:text-accent cursor-pointer transition-colors font-medium"
                >Copy base64</button>

                {editable && (
                    <button
                        onClick={handleFilePick}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-bg2 border border-border hover:border-accent text-text-dim hover:text-accent cursor-pointer transition-colors"
                    >
                        <Upload size={10} />
                        Upload
                    </button>
                )}
            </div>

            {error && (
                <div className="px-3 py-1.5 border-b border-red/30 bg-red/5 flex-shrink-0">
                    <span className="text-[11px] text-red font-mono">{error}</span>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto min-h-0">
                {!data ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                        {editable ? (
                            <>
                                <Upload size={24} className="text-text-dim/40 mb-2" />
                                <p className="text-xs text-text-dim">Drop a file here or click Upload</p>
                            </>
                        ) : (
                            <p className="text-xs text-text-dim italic">No binary data</p>
                        )}
                    </div>
                ) : viewMode === "preview" && isImage ? (
                    <div className="flex items-center justify-center p-4 h-full bg-[repeating-conic-gradient(#80808015_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                        <img
                            src={getImageDataUrl(data, contentType)}
                            alt="Preview"
                            className="max-w-full max-h-full object-contain"
                            style={{ imageRendering: dataSize < 10000 ? "pixelated" : "auto" }}
                        />
                    </div>
                ) : viewMode === "hex" ? (
                    <pre className="p-3 text-[11px] font-mono text-text-base leading-5 whitespace-pre select-all">
                        {hexDump(data)}
                    </pre>
                ) : (
                    <pre className="p-3 text-[11px] font-mono text-text-base leading-5 whitespace-pre-wrap break-all select-all">
                        {data}
                    </pre>
                )}
            </div>
        </div>
    );
}
