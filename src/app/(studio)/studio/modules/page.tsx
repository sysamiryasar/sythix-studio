import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/panel";
import { requireUser } from "@/lib/auth/current";
import { getModuleStates, listFlags, registryIssues } from "@/modules/service";
import { platformCan } from "@/lib/authz/roles";
import { RELEASE } from "@/generated/release";
import { ModuleManager } from "@/components/studio/module-manager";
import { setupChecklist } from "@/modules/studio/setup";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Modules" };

export default async function ModulesPage() {
  const { user, ctx } = await requireUser();
  const states = await getModuleStates(ctx);
  return (
    <div>
      <PageHeader eyebrow="Studio" title="Modules" description={`First-party modules registered in this build (platform v${RELEASE.version}). New modules are added through reviewed code changes; uploaded code is never executed.`} />
      {platformCan(user.platformRole, "platform.modules.manage") && (
        <Panel className="mb-6">
          <PanelHeader title="Installation setup" description="Optional integrations. SythiX runs without them, with the limitations noted." />
          <ul className="divide-y divide-border text-sm">
            {setupChecklist(ctx.env).map((i) => (
              <li key={i.key} className="flex items-start gap-3 px-4 py-2.5">
                <Badge tone={i.ok ? "success" : "warning"}>{i.ok ? "Configured" : "Not set"}</Badge>
                <div>
                  <div>{i.title}</div>
                  <div className="text-xs text-muted">{i.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <ModuleManager
        modules={states.map((s) => ({
          id: s.manifest.id,
          name: s.manifest.name,
          description: s.manifest.description,
          version: s.manifest.version,
          installedVersion: s.installedVersion,
          core: !!s.manifest.core,
          enabled: s.enabledFlag,
          available: s.available,
          reasons: s.reasons,
          health: s.health,
          dependencies: s.manifest.dependencies,
          platform: s.manifest.platform,
          migrations: s.manifest.migrations,
          permissions: s.manifest.permissions,
          icon: s.manifest.icon,
        }))}
        flags={await listFlags(ctx)}
        issues={registryIssues()}
        canManage={platformCan(user.platformRole, "platform.modules.manage")}
        canFlags={platformCan(user.platformRole, "platform.flags.manage")}
      />
    </div>
  );
}
