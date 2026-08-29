import React, { useState } from "react";
import { AppConfig, ServiceInfo } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import { RefreshCw, Zap } from "@/lib/icons";
import { Button, Badge, EmptyState, DataTable, PanelLayout, SectionCard } from "@/components/ui";
import { strings } from "@/lib/strings";
import type { TableColumn } from "@/components/ui";

interface Props {
  services: ServiceInfo[];
  config: AppConfig;
  onRefresh: () => void;
  onQuickMap: (target: string) => void;
  onOpenMappings: () => void;
  onOpenRequests: () => void;
  onOpenCapture: () => void;
  onOpenSettings: () => void;
}

export default function ServicesPanel({
  services,
  config,
  onRefresh,
  onQuickMap,
  onOpenMappings,
  onOpenRequests,
  onOpenCapture,
  onOpenSettings,
}: Props) {
  const [search, setSearch] = useState("");

  const portToMapping = new Map(
    config.mappings.map((m) => {
      const parts = m.target.split(":");
      const port = parseInt(parts[parts.length - 1], 10);
      return [port, m];
    })
  );

  const q = search.trim().toLowerCase();
  const filtered = q
    ? services.filter(
        (s) =>
          String(s.port).includes(q) ||
          s.processName.toLowerCase().includes(q) ||
          s.address.toLowerCase().includes(q) ||
          (portToMapping.get(s.port)?.domain ?? "").toLowerCase().includes(q) ||
          (portToMapping.get(s.port)?.label ?? "").toLowerCase().includes(q)
      )
    : services;
  const runningService = services.find((s) => !portToMapping.has(s.port)) ?? services[0] ?? null;
  const directHostHint = config.port === 80 ? "myapp.localhost" : `myapp.localhost:${config.port}`;

  const columns: TableColumn<ServiceInfo>[] = [
    {
      key: "process",
      header: strings.services.colProcess,
      render: (s) => (
        <>
          <div className="text-sm text-text-base">{s.processName}</div>
          <div className="text-xs text-text-dim">{strings.services.pid.replace("{pid}", String(s.pid))}</div>
        </>
      ),
    },
    {
      key: "address",
      header: strings.services.colAddress,
      render: (s) => <span className="font-mono text-xs text-text-dim">{s.address}</span>,
    },
    {
      key: "port",
      header: strings.services.colPort,
      render: (s) => (
        <span className="font-mono text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded">{s.port}</span>
      ),
    },
    {
      key: "status",
      header: strings.services.colStatus,
      render: (s) => {
        const mapping = portToMapping.get(s.port);
        return mapping
          ? <Badge variant="green" dot>{strings.services.mapped}</Badge>
          : <Badge variant="neutral">{strings.services.unmapped}</Badge>;
      },
    },
    {
      key: "map",
      header: strings.services.colMap,
      align: "center",
      render: (s) => {
        const mapping = portToMapping.get(s.port);
        return mapping
          ? <span className="font-mono text-xs text-text-bright">{mapping.label || mapping.domain}</span>
          : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onQuickMap(`localhost:${s.port}`)}
            >
              {strings.services.mapAction} →
            </Button>
          );
      },
    },
  ];

  return (
    <PanelLayout
      title={strings.services.title}
      subtitle={strings.services.subtitle}
      actions={
        <>
          <SearchInput value={search} onChange={setSearch} placeholder={strings.services.searchPlaceholder} />
          <Button variant="secondary" icon={<RefreshCw size={12} />} onClick={onRefresh}>{strings.services.refresh}</Button>
        </>
      }
    >
      <SectionCard className="mb-5">
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-text-bright">{strings.services.quickStartTitle}</h2>
              <p className="mt-1 text-xs leading-relaxed text-text-dim">{strings.services.quickStartBody.replace("{domain}", directHostHint)}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => runningService ? onQuickMap(`localhost:${runningService.port}`) : onOpenMappings()}
                className="rounded-md border border-border bg-bg2 px-3 py-3 text-left transition-colors hover:bg-bg3"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">{strings.services.quickStepOne}</div>
                <div className="mt-1 text-sm font-medium text-text-base">{strings.services.quickStepOneTitle}</div>
                <div className="mt-1 text-xs text-text-dim">
                  {runningService
                    ? strings.services.quickStepOneHint.replace("{port}", String(runningService.port))
                    : strings.services.quickStepOneEmpty}
                </div>
              </button>
              <button
                type="button"
                onClick={onOpenRequests}
                className="rounded-md border border-border bg-bg2 px-3 py-3 text-left transition-colors hover:bg-bg3"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">{strings.services.quickStepTwo}</div>
                <div className="mt-1 text-sm font-medium text-text-base">{strings.services.quickStepTwoTitle}</div>
                <div className="mt-1 text-xs text-text-dim">{strings.services.quickStepTwoHint}</div>
              </button>
              <button
                type="button"
                onClick={onOpenCapture}
                className="rounded-md border border-border bg-bg2 px-3 py-3 text-left transition-colors hover:bg-bg3"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">{strings.services.quickStepThree}</div>
                <div className="mt-1 text-sm font-medium text-text-base">{strings.services.quickStepThreeTitle}</div>
                <div className="mt-1 text-xs text-text-dim">{strings.services.quickStepThreeHint}</div>
              </button>
            </div>
          </div>

          <div className="rounded-md border border-accent/20 bg-accent/5 px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">{strings.services.routingModesTitle}</div>
            <div className="mt-2 space-y-2 text-xs leading-relaxed text-text-dim">
              <p>{strings.services.routingModesBody.replace("{domain}", directHostHint).replace("{port}", String(config.port))}</p>
              <p>{strings.services.routingModesTip}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onOpenMappings}>{strings.services.openMappings}</Button>
              <Button variant="secondary" size="sm" onClick={onOpenSettings}>{strings.services.openServerSettings}</Button>
            </div>
          </div>
        </div>
      </SectionCard>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Zap size={36} />}
          title={q ? strings.services.noMatching : strings.services.noServices}
          description={q ? strings.services.noMatchingHint : strings.services.noServicesHint}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(s) => String(s.port)}
        />
      )}
    </PanelLayout>
  );
}
