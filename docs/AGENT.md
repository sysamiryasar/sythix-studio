# ServerOS agent

`@sythix/server-agent` connects a Paper or Purpur server to SythiX Studio. It runs on the same
machine as the server, needs Node.js 20+, and has **no npm dependencies**.

## Security model

- **Outbound only.** The agent calls `https://<studio>/api/agent/v1/heartbeat`; no ports are opened.
- **RCON stays on localhost.** The config loader refuses non-loopback RCON hosts. Never forward
  port 25575.
- **Revocable credential.** `sxa_<prefix>_<secret>`; SythiX stores only its hash. Revoke or rotate
  under *Server → Access*. A revoked agent stops on its next heartbeat.
- **Typed operations only.** No shell, no arbitrary paths. The agent re-validates every operation
  against its **local** `allow` settings, a console denylist (`stop`, `restart`, `reload`,
  `op`, …) plus your `deniedCommands`, and a path sandbox that rejects `..`, absolute paths and
  symlinks.
- **Writes are backed up** to `.sythix-backups/<timestamp>/…` and use optimistic concurrency
  (a config write is refused if the file changed since it was read).
- **Never restarts the server.** Datapacks can optionally be activated with `/minecraft:reload`
  when the deployer explicitly requests it.

## Install

1. In `server.properties`:
   ```properties
   enable-rcon=true
   rcon.port=25575
   rcon.password=<long random password>
   ```
   Restart the server once to apply.
2. In ServerOS, register the server and copy the credential (shown once).
3. From the server directory:
   ```bash
   npx @sythix/server-agent init --api-url https://studio.example.com --token sxa_xxxxxxxx_... --server-dir .
   ```
   Until the package is published, build it from this repo (`pnpm agent:build`) and run
   `node agent/dist/agent.js` instead of `npx @sythix/server-agent`.
4. Edit `sythix-agent.json` (created with mode `600`): set `rcon.password` and review `allow`.
5. Run it as the same user as the Minecraft server, ideally under systemd:
   ```ini
   [Unit]
   Description=SythiX ServerOS agent
   After=network-online.target

   [Service]
   User=minecraft
   WorkingDirectory=/srv/minecraft
   ExecStart=/usr/bin/node /opt/sythix-agent/dist/agent.js run --config /srv/minecraft/sythix-agent.json
   Restart=on-failure
   NoNewPrivileges=true
   ProtectSystem=strict
   ReadWritePaths=/srv/minecraft

   [Install]
   WantedBy=multi-user.target
   ```

## Configuration

```jsonc
{
  "apiUrl": "https://studio.example.com",
  "token": "sxa_…",
  "mode": "live",                 // or "simulated" (sample environment, no Minecraft server)
  "serverDir": ".",               // contains server.properties, plugins/, logs/
  "worldName": "world",           // datapacks go to <worldName>/datapacks
  "rcon": { "host": "127.0.0.1", "port": 25575, "password": "…" },
  "allow": {
    "console": true,              // relay console commands (denylist always applies)
    "players": true,              // kick / ban / pardon
    "plugins": true,              // read plugin jars' plugin.yml
    "configRead": true,           // read plugins/<plugin>/<file>.{yml,yaml,json,properties,toml,conf}
    "configWrite": false,         // write/restore those files (with backup)
    "datapackDeploy": false       // install ForgeOS datapacks into <world>/datapacks
  },
  "deniedCommands": ["whitelist"] // extra console roots to refuse
}
```

The agent advertises only enabled capabilities; SythiX hides or refuses operations the agent does
not advertise.

## What it reports

| Data | Source | Labelled as |
|---|---|---|
| Online players, max players, UUIDs | RCON `list uuids` | Live |
| TPS 1m/5m/15m | RCON `tps` (Paper/Purpur) | Live, or “Not supported” |
| Software and Minecraft version | `version_history.json` | Live |
| Console | tail of `logs/latest.log` (handles rotation) | Live |
| Bans | `banned-players.json` (sent when it changes) | Last reported |
| Host memory, load, CPU count | the agent machine (not the JVM heap) | Host |

## Simulated mode

`init --simulated` writes a config with `mode: "simulated"` and a sample server directory. The
agent then fakes players, TPS and console output. Every heartbeat is flagged, and the UI labels the
server *Sample environment* on every view. Simulated connections never award achievements.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Credential rejected` and the agent exits | The credential was revoked; issue a new one |
| Server shows *Server not responding to RCON* | Check `enable-rcon`, port and password; the agent still heartbeats |
| Operation fails with “disabled in this agent's local configuration” | Enable the matching `allow` flag and restart the agent |
| Deployment check “Minecraft version matches export target” fails | Set the ForgeOS project's target to the server's version family |
