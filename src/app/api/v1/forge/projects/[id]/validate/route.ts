import { route } from "@/lib/http/api";
import { requireProject } from "@/modules/forgeos/projects";
import { loadProjectContent } from "@/modules/forgeos/content";
import { validateContent } from "@/modules/forgeos/validate";

export const GET = route<{ id: string }>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  await requireProject(ctx, user, params.id, "project.view");
  return validateContent((await loadProjectContent(ctx, params.id))!);
});
