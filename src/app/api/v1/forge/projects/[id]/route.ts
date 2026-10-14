import { z } from "zod";
import { route } from "@/lib/http/api";
import { requireProject, setArchived, updateProject } from "@/modules/forgeos/projects";
import { projectInput } from "@/modules/forgeos/schema";
import { loadProjectContent } from "@/modules/forgeos/content";

type P = { id: string };

export const GET = route<P>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  await requireProject(ctx, user, params.id, "project.view");
  return loadProjectContent(ctx, params.id);
});

export const PATCH = route<P>({ module: "forgeos" }, async ({ ctx, user, params, body }) => {
  const input = await body(projectInput.partial().extend({ packDescription: z.string().max(200).optional(), archived: z.boolean().optional() }));
  if (input.archived !== undefined) await setArchived(ctx, user, params.id, input.archived);
  await updateProject(ctx, user, params.id, input);
  return { ok: true };
});
