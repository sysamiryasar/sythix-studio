import { route } from "@/lib/http/api";
import { getTelemetry } from "@/modules/serveros/reads";

const RANGES: Record<string, number> = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000, "7d": 604_800_000 };
export const GET = route<{ id: string }>({ module: "serveros" }, async ({ ctx, user, params, query }) => getTelemetry(ctx, user, params.id, RANGES[query.get("range") ?? "1h"] ?? RANGES["1h"]!));
