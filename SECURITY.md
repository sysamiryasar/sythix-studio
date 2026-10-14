# Security policy

## Reporting a vulnerability

Please **do not** open a public issue. Report privately through GitHub's
*Security → Report a vulnerability* on this repository, including steps to reproduce and impact.
You will receive an acknowledgement within 3 business days. Please allow up to 90 days for a fix
before public disclosure.

In scope: the SythiX Studio Worker, its APIs, the server agent, and the release pipeline.
Out of scope: denial of service through volume, social engineering, findings that require a
compromised host running the agent.

## Supported versions

Only the latest released minor version receives security fixes during the 0.x series.

## Design

See [docs/SECURITY-ARCHITECTURE.md](docs/SECURITY-ARCHITECTURE.md) for controls and known gaps.
