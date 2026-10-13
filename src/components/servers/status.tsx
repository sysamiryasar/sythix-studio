"use client";

import { Badge, StatusDot } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import type { ServerSummary } from "@/modules/serveros/servers";

export function ConnectionBadge({ c }: { c: ServerSummary["connection"] }) {
  if (c.state === "online")
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone="success">
          <StatusDot tone="success" pulse label="Online" /> Agent connected
        </Badge>
        {c.serverReachable === false && <Badge tone="warning">Server not responding to RCON</Badge>}
        {c.simulated && <Badge tone="warning" title="This agent runs in simulated mode; no real Minecraft server is attached.">Sample environment</Badge>}
      </span>
    );
  if (c.state === "offline")
    return (
      <Badge tone="danger">
        <StatusDot tone="danger" label="Disconnected" /> Disconnected · last seen <RelativeTime ts={c.lastHeartbeatAt} />
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <StatusDot tone="neutral" label="Never connected" /> Agent never connected
    </Badge>
  );
}
