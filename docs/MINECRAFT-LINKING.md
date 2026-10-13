# Minecraft Java account linking

SythiX verifies Minecraft Java ownership through the official sign-in chain. Users authenticate
with Microsoft directly; **SythiX never asks for a Microsoft or Minecraft password**.

Flow (`src/modules/nexusid/minecraft.ts`):

1. `GET /api/v1/nexus/minecraft/link` creates a single-use state and PKCE verifier (stored hashed /
   server-side, 10-minute expiry) and redirects to Microsoft (`XboxLive.signin`).
2. The callback verifies the state belongs to the signed-in user, exchanges the code, then:
   Xbox Live user token → XSTS token (`rp://api.minecraftservices.com/`) → Minecraft services
   login → `GET /minecraft/profile`.
3. Only the public UUID and name are stored in `verified_identities`. **All tokens are discarded.**
   A Minecraft account can be linked to only one SythiX account.

## Enabling it

1. Register an app in Microsoft Entra (personal Microsoft accounts), redirect URI
   `<APP_URL>/api/v1/nexus/minecraft/callback`, and create a client secret.
2. Apply for Minecraft API access for that app (Mojang requires approval for new apps; until it
   is granted, the Minecraft services step returns 403).
3. Set `MS_CLIENT_ID` (var) and `MS_CLIENT_SECRET` (secret), then enable the
   `nexusid.minecraft-linking` feature flag in *Studio → Modules*.

Until then the account page shows linking as *Not configured*. The full chain is covered by a
test with mocked Microsoft/Xbox/Minecraft responses; it has not been exercised against the live
services from this repository.
