import { z } from "zod";
import { route } from "@/lib/http/api";
import { createProject, listProjects } from "@/modules/forgeos/projects";
import { projectInput } from "@/modules/forgeos/schema";
import { resolveCurrentWorkspace } from "@/modules/studio/workspace";

export const GET = route({ module: "forgeos" }, async ({ ctx, user, query }) => {
  const ws = query.get("workspaceId") ?? (await resolveCurrentWorkspace(ctx, user)).current.id;
  return listProjects(ctx, user, ws, query.get("archived") === "1");
});

export const POST = route({ module: "forgeos" }, async ({ ctx, user, body }) => {
  const input = await body(projectInput.extend({ workspaceId: z.string().max(64).optional() }));
  const ws = input.workspaceId ?? (await resolveCurrentWorkspace(ctx, user)).current.id;
  return createProject(ctx, user, ws, input);
});
