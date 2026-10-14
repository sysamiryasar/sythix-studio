import { getAppContext, type AppContext } from "../context";
import { AppError } from "../errors";
import { enforceRateLimit, RATE_LIMITS } from "../security/rate-limit";
import { authenticateAgent, type AgentPrincipal } from "@/modules/serveros/credentials";
import { assertModuleEnabled } from "@/modules/service";
import { errorResponse, jsonResponse } from "./api";

/**
 * Wrapper for agent endpoints. Agents authenticate with a revocable bearer
 * credential (never cookies), so browser CSRF does not apply; requests carrying
 * cookies or an Origin header are rejected to keep this surface agent-only.
 */
export function agentRoute<P = Record<string, string>>(handler: (args: { req: Request; ctx: AppContext; agent: AgentPrincipal; params: P }) => Promise<unknown>) {
  return async (req: Request, routeCtx: { params: Promise<P> }): Promise<Response> => {
    try {
      if (req.headers.get("cookie") || req.headers.get("origin")) throw new AppError("forbidden", "Agent endpoints do not accept browser requests.");
      const ctx = await getAppContext(req);
      await assertModuleEnabled(ctx, "serveros");
      const agent = await authenticateAgent(ctx, req.headers.get("authorization"));
      if (!agent) throw new AppError("unauthenticated", "Invalid or revoked agent credential.");
      await enforceRateLimit(ctx, RATE_LIMITS.agent, agent.credentialId);
      const result = await handler({ req, ctx, agent, params: ((await routeCtx?.params) ?? {}) as P });
      return result instanceof Response ? result : jsonResponse({ data: result });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
