import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { getServer } from "@/modules/serveros/servers";
import { getPlugins } from "@/modules/serveros/reads";
import { serverCan } from "@/lib/authz/roles";
import { isFlagEnabled } from "@/modules/service";
import { PluginsView } from "@/components/servers/plugins-view";

export default async function PluginsPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { user, ctx } = await requireUser();
  const s = await getServer(ctx, user, serverId);
  if (!serverCan(s.role, "server.plugins.read")) notFound();
  const caps = s.connection.capabilities;
  return (
    <PluginsView
      serverId={s.id}
      plugins={await getPlugins(ctx, user, serverId)}
      online={s.connection.state === "online"}
      mcVersion={s.connection.reportedVersion ?? s.mc_version}
      canRead={caps.includes("config")}
      canWrite={serverCan(s.role, "server.plugins.manage") && caps.includes("config.write") && (await isFlagEnabled(ctx, "serveros.config-editor"))}
      canScan={caps.includes("plugins")}
    />
  );
}
