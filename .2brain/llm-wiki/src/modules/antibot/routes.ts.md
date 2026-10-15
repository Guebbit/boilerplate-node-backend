---
source: src/modules/antibot/routes.ts
sha256: 8f2bf3fbf654ea8fff54bbf5bb55ed90b5860edb07c686ddaa767109a0f1a5d0
generated_at: 2026-10-15T10:20:02.160184+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/routes.ts

## Purpose

Defines the two public HTTP routes for the antibot module — exposing which human-challenge provider is active and, when the server self-hosts that provider, the challenge payload the client must render. Both endpoints are read-only and exist solely to let a browser client bootstrap the challenge flow without hitting a heavier API.

## Key elements

- **`router`** (exported `Router`) — the single Express router for this module; the only export of the file.
- **`GET /config`** → delegates to `getAntibotConfig`; returns the active provider's name and the public values a client needs.
- **`GET /challenge`** → delegates to `getAntibotChallenge`; returns the work the client must render. Returns **404** when the currently active provider does not self-host its challenge.

## Relationships

- **`controllers/get-antibot-challenge.ts`** — imported and mounted at `GET /challenge`.
- **`controllers/get-antibot-config.ts`** — imported and mounted at `GET /config`.
- **`module.ts`** — the module entry point that registers this `router` into the application (mounting not visible in this file, but it is the sole consumer of the exported `router`).

## Notes

- Both routes are strictly read-only; the file header explicitly states they are bounded only by the global burst brake in `app/security.ts` and "cost no more than any other request a scanner sends." No session, DB, or cache writes occur here.
- The route paths are relative (`/config`, `/challenge`); the final URL depends on the mount point chosen in `module.ts`.
- The file intentionally contains no middleware, validation, or business logic — all of that lives in the two controllers.
