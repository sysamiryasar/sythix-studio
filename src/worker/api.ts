import { createApp } from "./app";
import { identityRoutes } from "./routes/identity";
import { socialRoutes } from "./routes/social";
import { connectRoutes } from "./routes/connect";
import { platformRoutes } from "./routes/platform";

/** The complete API (no Durable Object class import, so it also runs under Node in tests). */
export function buildApi() {
  const app = createApp();
  identityRoutes(app);
  socialRoutes(app);
  connectRoutes(app);
  platformRoutes(app);
  return app;
}
