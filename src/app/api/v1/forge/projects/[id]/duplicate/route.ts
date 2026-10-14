import { route } from "@/lib/http/api";
import { duplicateProject } from "@/modules/forgeos/projects";

export const POST = route<{ id: string }>({ module: "forgeos" }, async ({ ctx, user, params }) => duplicateProject(ctx, user, params.id));
