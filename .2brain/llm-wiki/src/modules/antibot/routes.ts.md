---
source: src/modules/antibot/routes.ts
sha256: 124b5cc9b9209afbe960c6489f708f127e8aa168b81049eafb488e4045ac1220
generated_at: 2026-09-23T18:22:59.376422+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/routes.ts

## Purpose

Defines the Express router for the antibot module's two public GET endpoints. It wires each path to a thin controller so the anti-scraping challenge flow (config retrieval + challenge payload) is exposed without any write side-effects.

## Key elements

- **`router`** (exported `express.Router`) — the single export consumed by the module mount.
- **`GET /config`** → delegates to `getAntibotConfig`. Returns the active human-challenge provider's client-rendering metadata.
- **`GET /challenge`** → delegates to `getAntibotChallenge`. Returns the work/data the client needs to render the challenge when this server hosts the provider itself.

## Relationships

- **`./controllers/get-antibot-config.ts`** — imported; handler for `GET /config`.
- **`./controllers/get-antibot-challenge.ts`** — imported; handler for `GET /challenge`.
- **`./module.ts`** — mounts this `router` into the application (parent in the module hierarchy).
- **`tests/support/routed-modules.ts`** — references this router when building test app instances for route-level integration tests.

## Notes

- Both routes are strictly read-only; they are intentionally bounded only by the global burst-rate limiter in `app/security.ts` rather than any per-route auth or session check, because a scanner can send them freely with no privilege gain.
- The file contains no middleware of its own (no auth, no rate-limit) — all cross-cutting protection lives upstream in `app/security.ts`.
- Route ordering is fixed (`/config` before `/challenge`); Express matches first-come, so reordering has no effect here since paths don't overlap, but be aware if adding parameterised routes.
