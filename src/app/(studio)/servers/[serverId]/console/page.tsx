import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { getServer } from "@/modules/serveros/servers";
import { serverCan } from "@/lib/authz/roles";
import { ConsoleView } from "@/components/servers/console-view";

export default async function ConsolePage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { user, ctx } = await requireUser();
  const s = await getServer(ctx, user, serverId);
  if (!serverCan(s.role, "server.console.read")) notFound();
  return <ConsoleView serverId={s.id} online={s.connection.state === "online"} canExecute={serverCan(s.role, "server.console.execute") && s.connection.capabilities.includes("console")} simulated={s.connection.simulated} />;
}
