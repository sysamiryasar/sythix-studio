import { route } from "@/lib/http/api";
import { deleteAsset, readAsset } from "@/modules/forgeos/assets";

type P = { id: string; assetId: string };

export const GET = route<P>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  const a = await readAsset(ctx, user, params.id, params.assetId);
  return new Response(a.body, {
    headers: { "content-type": a.contentType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
});

export const DELETE = route<P>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  await deleteAsset(ctx, user, params.id, params.assetId);
  return { ok: true };
});
