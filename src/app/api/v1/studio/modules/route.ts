import { route } from "@/lib/http/api";
import { getModuleStates, registryIssues } from "@/modules/service";

export const GET = route({}, async ({ ctx }) => ({
  modules: (await getModuleStates(ctx)).map((s) => ({ ...s, manifest: { ...s.manifest, healthCheck: undefined } })),
  issues: registryIssues(),
}));
