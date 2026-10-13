import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { MinecraftUnlink } from "./minecraft-unlink";

/**
 * Minecraft Java linking uses Microsoft sign-in (OAuth) followed by the Xbox Live
 * and Minecraft services token exchange. SythiX never asks for a Minecraft or
 * Microsoft password. The flow is gated on an approved Microsoft app
 * registration (MS_CLIENT_ID) and the nexusid.minecraft-linking flag.
 */
export function MinecraftLinkPanel({ identity, available }: { identity: { provider_name: string; provider_subject: string; verified_at: number } | null; available: boolean }) {
  return (
    <Panel>
      <PanelHeader title="Minecraft Java account" description="Link through Microsoft sign-in. We never ask for your Microsoft or Minecraft password." />
      <PanelBody className="text-sm">
        {identity ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{identity.provider_name}</div>
              <div className="font-mono text-xs text-faint">{identity.provider_subject}</div>
            </div>
            <span className="flex items-center gap-2">
              <Badge tone="success">Verified {formatDateTime(identity.verified_at)}</Badge>
              <MinecraftUnlink />
            </span>
          </div>
        ) : available ? (
          <a className="text-accent hover:underline" href="/api/v1/nexus/minecraft/link">
            Link with Microsoft
          </a>
        ) : (
          <div className="flex items-start gap-3">
            <Badge tone="neutral">Not configured</Badge>
            <p className="text-muted">
              Account linking is not available on this installation yet. It requires an approved Microsoft identity platform app with Minecraft API access. See{" "}
              <span className="font-mono text-xs">docs/MINECRAFT-LINKING.md</span>.
            </p>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
