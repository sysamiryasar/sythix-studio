import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getModuleStates, listFlags, registryIssues } from "@/modules/service";
import { platformCan } from "@/lib/authz/roles";
import { RELEASE } from "@/generated/release";
import { PageHeader } from "@/components/ui/panel";
import { ModuleManager } from "@/components/studio/module-manager";

export const metadata: Metadata = { title: "Modules" };

export default async function ModulesPage() {
  const { user, ctx } = await requireUser();
  const states = await getModuleStates(ctx);
  return (
    <div>
      <PageHeader eyebrow="Studio" title="Modules" description={`First-party modules registered in this build (platform v${RELEASE.version}). New modules are added through reviewed code changes; uploaded code is never executed.`} />
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
