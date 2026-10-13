import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { resolveCurrentWorkspace } from "@/modules/studio/workspace";
import { workspaceCan } from "@/lib/authz/roles";
import { PageHeader } from "@/components/ui/panel";
import { ConnectWizard } from "@/components/servers/connect-wizard";

export const metadata: Metadata = { title: "Register server" };

export default async function NewServerPage() {
  const { user, ctx } = await requireUser();
  const { current } = await resolveCurrentWorkspace(ctx, user);
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="ServerOS" title="Register a server" description={`Adds a server to ${current.name} and generates a revocable agent credential.`} />
      <ConnectWizard canRegister={workspaceCan(current.role, "server.register")} verified={user.emailVerified} appUrl={ctx.env.APP_URL} />
    </div>
  );
}
