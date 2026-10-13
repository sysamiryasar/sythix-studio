import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { one } from "@/lib/db/sql";
import { AccountForm } from "@/components/settings/account-form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/authz/roles";
import { listUserWorkspaces } from "@/lib/authz/check";
import { MinecraftLinkPanel } from "@/components/settings/minecraft-link";
import { isFlagEnabled } from "@/modules/service";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountSettingsPage() {
  const { user, ctx } = await requireUser();
  const identity = await one<{ provider_name: string; provider_subject: string; verified_at: number }>(
    ctx.db,
    `SELECT provider_name, provider_subject, verified_at FROM verified_identities WHERE user_id = ? AND provider = 'minecraft_java'`,
    user.id,
  );
  const workspaces = await listUserWorkspaces(ctx, user.id);
  const linkingEnabled = (await isFlagEnabled(ctx, "nexusid.minecraft-linking")) && !!ctx.env.MS_CLIENT_ID;
  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="Profile basics" description="Your username is permanent; your display name can change." />
        <PanelBody>
          <AccountForm username={user.username} email={user.email} displayName={user.displayName} emailVerified={user.emailVerified} />
        </PanelBody>
      </Panel>
      <MinecraftLinkPanel identity={identity} available={linkingEnabled} />
      <Panel>
        <PanelHeader title="Roles" description="Roles are scoped. Workspace roles never grant access to servers; server access is granted per server." />
        <PanelBody className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Platform</span>
            <Badge tone={user.platformRole === "member" ? "neutral" : "accent"}>{ROLE_LABELS[user.platformRole]}</Badge>
          </div>
          {workspaces.map((w) => (
            <div key={w.id} className="flex items-center justify-between">
              <span className="text-muted">{w.name}</span>
              <Badge>{ROLE_LABELS[w.role]}</Badge>
            </div>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
