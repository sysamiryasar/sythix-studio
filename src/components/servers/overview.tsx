"use client";

import { RelativeTime } from "@/components/ui/relative-time";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { formatBytes, formatDuration } from "@/lib/format";
import type { ServerSummary } from "@/modules/serveros/servers";
import { DataSourceBadge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/tabs";
import { MetricChart } from "./metric-chart";
import { AgentInstructions } from "./connect-wizard";

interface Telemetry {
  bucket_start: number;
  players_online: number | null;
  tps_1m: number | null;
  host_mem_used: number | null;
  host_mem_total: number | null;
  host_load_1m: number | null;
}

function MetricTile({ label, value, source, hint }: { label: string; value: React.ReactNode; source: "live" | "stale" | "unavailable" | "sample"; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</span>
        <DataSourceBadge source={source} />
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${source === "unavailable" ? "text-faint" : "text-fg"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function ServerOverview({
  server,
  latest,
  events,
  alerts,
  now,
}: {
  server: ServerSummary;
  latest: { players_online: number | null; players_max: number | null; tps_1m: number | null; host_mem_used: number | null; host_mem_total: number | null; host_load_1m: number | null; host_cpu_count: number | null; bucket_start: number } | null;
  events: { action: string; created_at: number; actor: string | null }[];
  alerts: { title: string; created_at: number }[];
  now: number;
}) {
  const c = server.connection;
  const [range, setRange] = useState<"1h" | "6h" | "24h" | "7d">("1h");
  const [series, setSeries] = useState<Telemetry[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => api<Telemetry[]>(`/api/v1/servers/${server.id}/telemetry?range=${range}`).then((d) => alive && setSeries(d)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [server.id, range]);

  const src = (v: unknown): "live" | "stale" | "unavailable" | "sample" => (v == null ? "unavailable" : c.simulated ? "sample" : c.state === "online" ? "live" : "stale");

  if (c.state === "never_connected") {
    return (
      <Panel>
        <PanelHeader title="Connect the agent" description="No agent has connected yet, so there are no metrics to show. Issue a credential under Access, then:" />
        <PanelBody>
          <AgentInstructions token="<credential from the Access tab>" appUrl={typeof window !== "undefined" ? window.location.origin : ""} />
        </PanelBody>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {c.state === "offline" && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          This server is disconnected. Figures below are the last values reported <RelativeTime ts={c.lastHeartbeatAt} now={now} />; no operations can be sent until the agent reconnects.
        </div>
      )}
      {c.simulated && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Sample environment: this agent runs in simulated mode. Players, TPS and console output are generated sample data, not a real Minecraft server.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Players" value={latest?.players_online != null ? `${latest.players_online} / ${latest.players_max ?? "?"}` : "—"} source={src(latest?.players_online)} hint="From RCON `list`" />
        <MetricTile label="TPS (1m)" value={latest?.tps_1m != null ? latest.tps_1m.toFixed(2) : "Not supported"} source={src(latest?.tps_1m)} hint="Paper/Purpur `tps` command" />
        <MetricTile label="Host memory" value={latest?.host_mem_used != null ? `${formatBytes(latest.host_mem_used)} / ${formatBytes(latest.host_mem_total)}` : "—"} source={src(latest?.host_mem_used)} hint="Agent machine, not the JVM heap" />
        <MetricTile label="Host load (1m)" value={latest?.host_load_1m != null ? `${latest.host_load_1m.toFixed(2)} · ${latest.host_cpu_count} CPU` : "—"} source={src(latest?.host_load_1m)} hint="Agent machine load average" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Software" value={`${c.reportedSoftware ?? server.software} ${c.reportedVersion ?? server.mc_version}`} source={c.reportedVersion ? src(1) : "unavailable"} hint={c.reportedVersion && c.reportedVersion !== server.mc_version ? `Registered as ${server.mc_version}` : "From version_history.json"} />
        <MetricTile label="Connected for" value={c.connectedSince ? formatDuration(now - c.connectedSince) : "—"} source={c.connectedSince ? src(1) : "unavailable"} hint="Agent connection uptime; server process uptime isn't exposed over RCON" />
        <MetricTile label="Agent" value={c.agentVersion ?? "—"} source={c.agentVersion ? src(1) : "unavailable"} hint={c.capabilities.length ? c.capabilities.join(", ") : "No capabilities while offline"} />
        <MetricTile label="Last heartbeat" value={<RelativeTime ts={c.lastHeartbeatAt} now={now} />} source={c.state === "online" ? (c.simulated ? "sample" : "live") : "stale"} />
      </div>
      <div className="flex justify-end">
        <SegmentedControl label="Time range" value={range} onChange={setRange} options={[{ value: "1h", label: "1h" }, { value: "6h", label: "6h" }, { value: "24h", label: "24h" }, { value: "7d", label: "7d" }]} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricChart title="Players online" points={series.map((s) => ({ t: s.bucket_start, v: s.players_online }))} min={0} format={(v) => v.toFixed(0)} />
        <MetricChart title="TPS (1m)" points={series.map((s) => ({ t: s.bucket_start, v: s.tps_1m }))} min={0} max={20} format={(v) => v.toFixed(1)} />
        <MetricChart title="Host memory used" points={series.map((s) => ({ t: s.bucket_start, v: s.host_mem_used != null && s.host_mem_total ? (s.host_mem_used / s.host_mem_total) * 100 : null }))} min={0} max={100} unit="%" format={(v) => v.toFixed(0)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Alerts" />
          <ul className="divide-y divide-border text-sm">
            {alerts.length === 0 && <li className="px-4 py-3 text-xs text-muted">No alerts.</li>}
            {alerts.map((a, i) => (
              <li key={i} className="flex justify-between px-4 py-2">
                <span>{a.title}</span>
                <span className="text-xs text-faint"><RelativeTime ts={a.created_at} now={now} /></span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Recent events" />
          <ul className="divide-y divide-border text-sm">
            {events.map((e, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-2">
                <span className="truncate font-mono text-xs text-muted">{e.action}</span>
                <span className="shrink-0 text-xs text-faint">{e.actor ? `@${e.actor} · ` : ""}<RelativeTime ts={e.created_at} now={now} /></span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
