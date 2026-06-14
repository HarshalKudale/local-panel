import React, { useEffect, useReducer } from "react";
import Modal from "@/components/common/Modal";
import { Button } from "@/components/ui";
import { strings } from "@/lib/strings";
import {
  ImportExportEntityKind, CollisionStrategy,
  ImportExportFormatsMap, ImportExportFormatDef,
  ExportRequest, PreflightRequest, ImportRequest,
} from "@/types";

// -- Kind metadata ----------------------------------------------------------

const KIND_LABELS: Record<ImportExportEntityKind, string> = {
  workspace: strings.importExport.kindWorkspace,
  requests: strings.importExport.kindRequests,
  mocks: strings.importExport.kindMocks,
  environments: strings.importExport.kindEnvironments,
  mappings: strings.importExport.kindMappings,
  proxyRules: strings.importExport.kindProxyRules,
  websockets: strings.importExport.kindWebsockets,
  webhooks: strings.importExport.kindWebhooks,
};

const KIND_DESC: Record<ImportExportEntityKind, string> = {
  workspace: strings.importExport.descWorkspace,
  requests: strings.importExport.descRequests,
  mocks: strings.importExport.descMocks,
  environments: strings.importExport.descEnvironments,
  mappings: strings.importExport.descMappings,
  proxyRules: strings.importExport.descProxyRules,
  websockets: strings.importExport.descWebsockets,
  webhooks: strings.importExport.descWebhooks,
};

const ALL_KINDS: ImportExportEntityKind[] = [
  "workspace", "requests", "mocks", "environments",
  "mappings", "proxyRules", "websockets", "webhooks",
];

// -- State machine ----------------------------------------------------------

type Step =
  | { name: "selectKind" }
  | { name: "selectFormat" }
  | { name: "collision"; filePath: string; itemCount: number; collisionCount: number }
  | { name: "working" }
  | { name: "done"; ok: boolean; message: string };

interface State {
  step: Step;
  kind: ImportExportEntityKind | null;
  format: string | null;
  collisionStrategy: CollisionStrategy;
}

type Action =
  | { type: "selectKind"; kind: ImportExportEntityKind }
  | { type: "selectFormat"; format: string }
  | { type: "setStrategy"; strategy: CollisionStrategy }
  | { type: "working" }
  | { type: "collision"; filePath: string; itemCount: number; collisionCount: number }
  | { type: "done"; ok: boolean; message: string }
  | { type: "back" }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "selectKind":
      return { ...state, kind: action.kind, format: null, step: { name: "selectFormat" } };
    case "selectFormat":
      return { ...state, format: action.format };
    case "setStrategy":
      return { ...state, collisionStrategy: action.strategy };
    case "working":
      return { ...state, step: { name: "working" } };
    case "collision":
      return { ...state, step: { name: "collision", filePath: action.filePath, itemCount: action.itemCount, collisionCount: action.collisionCount } };
    case "done":
      return { ...state, step: { name: "done", ok: action.ok, message: action.message } };
    case "back":
      if (state.step.name === "selectFormat") return { ...state, step: { name: "selectKind" } };
      if (state.step.name === "collision") return { ...state, step: { name: "selectFormat" } };
      return state;
    case "reset":
      return initialState;
    default:
      return state;
  }
}

const initialState: State = {
  step: { name: "selectKind" },
  kind: null,
  format: null,
  collisionStrategy: "keep",
};

// -- Props ------------------------------------------------------------------

interface Props {
  open: boolean;
  mode: "import" | "export";
  wsId: string;
  onClose(): void;
  onImportDone?(): void;
}

// -- Component --------------------------------------------------------------

export default function ImportExportModal({ open, mode, wsId, onClose, onImportDone }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [formats, setFormats] = React.useState<ImportExportFormatsMap>({});

  useEffect(() => {
    if (open) {
      dispatch({ type: "reset" });
      window.api.getImportExportFormats().then(setFormats).catch(() => setFormats({}));
    }
  }, [open]);

  const title = mode === "export" ? strings.importExport.exportData : strings.importExport.importData;
  const kindFormats: ImportExportFormatDef[] = state.kind
    ? (formats[state.kind] ?? []).filter((f) =>
      mode === "export" ? f.supportsExport : f.supportsImport,
    )
    : [];

  async function handleExport() {
    if (!state.kind || !state.format) return;
    dispatch({ type: "working" });
    const req: ExportRequest = { kind: state.kind, format: state.format, wsId };
    const res = await window.api.exportData(req);
    if (res.canceled) { dispatch({ type: "reset" }); return; }
    dispatch({ type: "done", ok: res.ok, message: res.ok ? strings.importExport.exportComplete : (res.error ?? strings.importExport.exportFailed) });
  }

  async function handleImportPreflight() {
    if (!state.kind || !state.format) return;
    dispatch({ type: "working" });
    const req: PreflightRequest = { kind: state.kind, format: state.format, wsId };
    const res = await window.api.preflightImport(req);
    if (res.canceled) { dispatch({ type: "reset" }); return; }
    if (!res.ok) {
      dispatch({ type: "done", ok: false, message: res.error ?? strings.importExport.couldNotReadFile });
      return;
    }
    const collisionCount = res.collisionIds?.length ?? 0;
    if (collisionCount > 0) {
      dispatch({ type: "collision", filePath: res.filePath!, itemCount: res.itemCount ?? 0, collisionCount });
    } else {
      await applyImport(res.filePath!, "keep");
    }
  }

  async function applyImport(filePath: string, strategy: CollisionStrategy) {
    if (!state.kind || !state.format) return;
    dispatch({ type: "working" });
    const req: ImportRequest = { kind: state.kind, format: state.format, wsId, filePath, collisionStrategy: strategy };
    const res = await window.api.importData(req);
    if (res.ok) {
      onImportDone?.();
      const n = res.imported ?? 0;
      const imported = strings.importExport.importedItems.replace("{n}", String(n)).replace("{s}", n !== 1 ? "s" : "");
      const skipped = res.skipped ? strings.importExport.skippedSuffix.replace("{n}", String(res.skipped)) : "";
      dispatch({ type: "done", ok: true, message: `${imported}${skipped}.` });
    } else {
      dispatch({ type: "done", ok: false, message: res.error ?? strings.importExport.importFailed });
    }
  }

  function handleClose() {
    dispatch({ type: "reset" });
    onClose();
  }

  return (
    <>
      <Modal open={open} title={title} onClose={handleClose}>
        {state.step.name === "selectKind" && (
          <StepSelectKind kinds={ALL_KINDS} onSelect={(k) => dispatch({ type: "selectKind", kind: k })} />
        )}
        {state.step.name === "selectFormat" && state.kind && (
          <StepSelectFormat
            mode={mode}
            kind={state.kind}
            formats={kindFormats}
            selected={state.format}
            onSelect={(f) => dispatch({ type: "selectFormat", format: f })}
            onBack={() => dispatch({ type: "back" })}
            onConfirm={mode === "export" ? handleExport : handleImportPreflight}
          />
        )}
        {state.step.name === "collision" && (
          <StepCollision
            step={state.step}
            strategy={state.collisionStrategy}
            onSetStrategy={(s) => dispatch({ type: "setStrategy", strategy: s })}
            onBack={() => dispatch({ type: "back" })}
            onConfirm={() => {
              const s = state.step as Extract<Step, { name: "collision" }>;
              applyImport(s.filePath, state.collisionStrategy);
            }}
          />
        )}
        {state.step.name === "working" && (
          <div className="flex items-center gap-3 py-6">
            <span className="inline-block w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-text-dim">{mode === "export" ? strings.importExport.exporting : strings.importExport.importing}</span>
          </div>
        )}
        {state.step.name === "done" && (
          <StepDone step={state.step as Extract<Step, { name: "done" }>} onClose={handleClose} />
        )}
      </Modal>
    </>
  );
}


function StepSelectKind({ kinds, onSelect }: { kinds: ImportExportEntityKind[]; onSelect(k: ImportExportEntityKind): void }) {
  return (
    <div>
      <p className="text-xs text-text-dim mb-3">{strings.importExport.whatToWorkWith}</p>
      <div className="grid grid-cols-2 gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => onSelect(k)}
            className="text-left px-4 py-3 rounded border border-border bg-bg2 hover:bg-bg3 hover:border-accent/40 transition-colors"
          >
            <div className="text-sm font-medium text-text-base">{KIND_LABELS[k]}</div>
            <div className="text-xs text-text-dim mt-0.5 line-clamp-1">{KIND_DESC[k]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepSelectFormat({
  mode, kind, formats, selected, onSelect, onBack, onConfirm,
}: {
  mode: "import" | "export";
  kind: ImportExportEntityKind;
  formats: ImportExportFormatDef[];
  selected: string | null;
  onSelect(f: string): void;
  onBack(): void;
  onConfirm(): void;
}) {
  return (
    <div>
      <p className="text-xs text-text-dim mb-3">
        {mode === "export" ? strings.importExport.chooseExportFormatFor : strings.importExport.chooseImportFormatFor}{" "}
        <span className="text-text-base font-medium">{KIND_LABELS[kind]}</span>
      </p>
      {formats.length === 0 ? (
        <p className="text-sm text-text-dim py-4 text-center">{strings.importExport.noFormatsAvailable}</p>
      ) : (
        <div className="space-y-1.5">
          {formats.map((f) => (
            <label
              key={f.id}
              className={`flex items-center gap-3 px-4 py-3 rounded border cursor-pointer transition-colors ${selected === f.id
                ? "border-accent/50 bg-accent/10"
                : "border-border bg-bg2 hover:bg-bg3"
                }`}
            >
              <input
                type="radio"
                name="format"
                value={f.id}
                checked={selected === f.id}
                onChange={() => onSelect(f.id)}
                className="accent-accent"
              />
              <div>
                <div className="text-sm font-medium text-text-base">{f.label}</div>
                <div className="text-xs text-text-dim">.{f.extensions.join(", .")}</div>
              </div>
            </label>
          ))}
        </div>
      )}
      <div className="flex justify-between mt-5 pt-4 border-t border-border">
        <Button variant="secondary" onClick={onBack}>{strings.importExport.back}</Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={!selected}
        >
          {mode === "export" ? strings.importExport.exportEllipsis : strings.importExport.chooseFile}
        </Button>
      </div>
    </div>
  );
}

function StepCollision({
  step, strategy, onSetStrategy, onBack, onConfirm,
}: {
  step: Extract<Step, { name: "collision" }>;
  strategy: CollisionStrategy;
  onSetStrategy(s: CollisionStrategy): void;
  onBack(): void;
  onConfirm(): void;
}) {
  return (
    <div>
      <div className="bg-yellow/10 border border-yellow/30 rounded px-4 py-3 mb-4">
        <p className="text-sm text-yellow font-medium">
          {strings.importExport.collisionSummary.replace("{count}", String(step.collisionCount)).replace("{total}", String(step.itemCount))}
        </p>
      </div>
      <p className="text-xs text-text-dim mb-3">{strings.importExport.howConflictsHandled}</p>
      <div className="space-y-2">
        {(["keep", "override", "new"] as CollisionStrategy[]).map((s) => (
          <label key={s} className={`flex items-start gap-3 px-4 py-3 rounded border cursor-pointer transition-colors ${strategy === s ? "border-accent/50 bg-accent/10" : "border-border bg-bg2 hover:bg-bg3"
            }`}>
            <input
              type="radio"
              name="collision"
              value={s}
              checked={strategy === s}
              onChange={() => onSetStrategy(s)}
              className="mt-0.5 accent-accent"
            />
            <div>
              <div className="text-sm font-medium text-text-base">{COLLISION_LABELS[s]}</div>
              <div className="text-xs text-text-dim">{COLLISION_DESC[s]}</div>
            </div>
          </label>
        ))}
      </div>
      <div className="flex justify-between mt-5 pt-4 border-t border-border">
        <Button variant="secondary" onClick={onBack}>{strings.importExport.back}</Button>
        <Button variant="primary" onClick={onConfirm}>{strings.importExport.import}</Button>
      </div>
    </div>
  );
}

const COLLISION_LABELS: Record<CollisionStrategy, string> = {
  keep: strings.importExport.collisionKeepLabel,
  override: strings.importExport.collisionOverrideLabel,
  new: strings.importExport.collisionNewLabel,
};
const COLLISION_DESC: Record<CollisionStrategy, string> = {
  keep: strings.importExport.collisionKeepDesc,
  override: strings.importExport.collisionOverrideDesc,
  new: strings.importExport.collisionNewDesc,
};

function StepDone({ step, onClose }: { step: Extract<Step, { name: "done" }>; onClose(): void }) {
  return (
    <div>
      <div className={`px-4 py-3 rounded border text-sm mb-5 ${step.ok ? "border-green/30 bg-green/10 text-green" : "border-red/30 bg-red/10 text-red"
        }`}>
        {step.message}
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onClose}>{strings.common.close}</Button>
      </div>
    </div>
  );
}
