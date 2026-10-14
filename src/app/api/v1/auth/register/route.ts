import { route } from "@/lib/http/api";
import { register, registerInput } from "@/lib/auth/service";

export const POST = route({ auth: "none" }, async ({ ctx, body }) => register(ctx, await body(registerInput)));
