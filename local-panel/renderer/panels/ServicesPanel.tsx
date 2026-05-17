import React, { useState } from "react";
import { AppConfig, ServiceInfo } from "@/types";
import SearchInput from "@/components/common/SearchInput";
import { RefreshCw, Zap } from "@/lib/icons";
import { Button, Badge, EmptyState, DataTable, PanelLayout } from "@/components/ui";
import type { TableColumn } from "@/components/ui";

interface Props {
  services: ServiceInfo[];
  config: AppConfig;
  onRefresh: () => void;
  onQuickMap: (target: string) => void;
}

export default function ServicesPanel({ services, config, onRefresh, onQuickMap }: Props) {
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

  const columns: TableColumn<ServiceInfo>[] = [
    {
      key: "process",
      header: "Process",
      render: (s) => (
        <>
          <div className="text-sm text-text-base">{s.processName}</div>
          <div className="text-xs text-text-dim">PID {s.pid}</div>
        </>
      ),
    },
    {
      key: "address",
      header: "Address",
      render: (s) => <span className="font-mono text-xs text-text-dim">{s.address}</span>,
    },
    {
      key: "port",
      header: "Port",
      render: (s) => (
        <span className="font-mono text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded">{s.port}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (s) => {
        const mapping = portToMapping.get(s.port);
        return mapping
          ? <Badge variant="green" dot>Mapped</Badge>
          : <Badge variant="neutral">Unmapped</Badge>;
      },
    },
    {
      key: "map",
      header: "Map",
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
              Map →
            </Button>
          );
      },
    },
  ];

  return (
    <PanelLayout
      title="Services"
      subtitle="Processes currently listening on localhost ports"
      actions={
        <>
          <SearchInput value={search} onChange={setSearch} placeholder="Port, process…" />
          <Button variant="secondary" icon={<RefreshCw size={12} />} onClick={onRefresh}>Refresh</Button>
        </>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Zap size={36} />}
          title={q ? "No matching services" : "No services found"}
          description={q ? "Try a different search term." : "No processes are listening on localhost ports."}
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
