// Local development runs with APP_ENV=development from .dev.vars (the committed
// wrangler config is production). Create it from the example on first run.
import { copyFileSync, existsSync } from "node:fs";
if (!existsSync(".dev.vars")) {
  copyFileSync(".dev.vars.example", ".dev.vars");
  console.log("Created .dev.vars from .dev.vars.example (APP_ENV=development).");
}
