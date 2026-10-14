import { z } from "zod";
import { route } from "@/lib/http/api";
import { listRevisions, requireProject, saveRevision } from "@/modules/forgeos/projects";

type P = { id: string };

export const GET = route<P>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  await requireProject(ctx, user, params.id, "project.view");
  return listRevisions(ctx, params.id);
});
export const POST = route<P>({ module: "forgeos" }, async ({ ctx, user, params, body }) => {
  const { message } = await body(z.object({ message: z.string().trim().max(200).default("") }));
  return { revision: await saveRevision(ctx, user, params.id, message) };
});
