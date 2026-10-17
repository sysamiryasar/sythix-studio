// Runs the Worker (wrangler dev, :8787) and the Vite dev server (:5173) together.
import { spawn } from "node:child_process";
const procs = [
  spawn("pnpm", ["exec", "wrangler", "dev", "--port", "8787"], { stdio: "inherit" }),
  spawn("pnpm", ["exec", "vite"], { stdio: "inherit" }),
];
const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", (code) => { if (code) { stop(); process.exit(code); } }));
