---
source: src/modules/antibot/routes.ts
source_sha256: ff948384890d070b345feb8968eb1f36baec824269fa979bc35b5634244dec1f
context_sha256: 7b1f59624054e953d1727e7aefd469f46080ae5e2f8205f3e8a4e79d73b8a098
generated_at: 2026-11-22T04:19:47.333290+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/antibot/routes.ts

## Purpose
Route table for the antibot module. It exposes a single public route that gives a client the challenge it needs to render the widget of a self-hosted antibot provider. Which widget the client renders is determined by the `antibot` field on `GET /config`, not by this file.

## Key elements
- `router` — Express `Router` for antibot endpoints.
- `GET /challenge` — mapped to `getAntibotChallenge`. The mount path is not set here. The in-file comment names the full path `/antibot/challenge`. It returns 404 when the active provider issues no challenge.

## Relationships
- `src/modules/antibot/controllers/get-antibot-challenge.ts` — supplies the `getAntibotChallenge` handler, which is the only route handler registered here.
- `src/modules/antibot/module.ts` — a graph neighbor. The file content does not show how the two connect. Presumably the module mounts this `router`, but that is not visible here.

## Notes
- The route is bounded only by the global burst brake in `src/app/security.ts`. It writes nothing, so it costs no more than any other request a scanner sends.
