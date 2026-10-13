# @sythix/server-agent

Outbound agent that connects a Paper or Purpur server to SythiX Studio's ServerOS.
Zero dependencies, Node.js 20+. See [docs/AGENT.md](../docs/AGENT.md) for installation, the
security model and configuration.

```bash
pnpm --dir agent build
node agent/dist/agent.js init --api-url https://studio.example.com --token sxa_... [--simulated]
node agent/dist/agent.js run --config sythix-agent.json
```
