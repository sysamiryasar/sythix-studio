import { route } from "@/lib/http/api";
import { badRequest } from "@/lib/errors";
import { uploadAsset } from "@/modules/forgeos/assets";
import { MODEL_MAX_BYTES, TEXTURE_MAX_BYTES } from "@/modules/forgeos/models";

const LIMIT = Math.max(TEXTURE_MAX_BYTES, MODEL_MAX_BYTES) + 16 * 1024;

/** multipart/form-data: kind=texture|model, name, file. Size is checked before the body is buffered. */
export const POST = route<{ id: string }>({ module: "forgeos" }, async ({ ctx, user, params, req }) => {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > LIMIT) throw badRequest("Upload is missing or too large.");
  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest("Expected a multipart form upload.");
  const kind = form.get("kind");
  const name = form.get("name");
  const file = form.get("file");
  if ((kind !== "texture" && kind !== "model") || typeof name !== "string" || !(file instanceof Blob)) throw badRequest("Provide kind, name and file.");
  if (file.size > LIMIT) throw badRequest("Upload is too large.");
  return uploadAsset(ctx, user, params.id, kind, name.trim().toLowerCase(), new Uint8Array(await file.arrayBuffer()));
});
