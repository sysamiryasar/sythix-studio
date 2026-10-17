import { copyFileSync, existsSync } from "node:fs";
if (!existsSync(".dev.vars")) {
  copyFileSync(".dev.vars.example", ".dev.vars");
  console.log("Created .dev.vars from .dev.vars.example");
}
// wrangler dev serves static assets from dist/client; make sure the folder exists.
import { mkdirSync } from "node:fs";
mkdirSync("dist/client", { recursive: true });
