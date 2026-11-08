---
source: src/modules/antibot/routes.ts
sha256: 5db8df7caa214642a1d3a74e65b100468e253c31c4a6997350e8d28a81e105ad
generated_at: 2026-11-08T05:00:40.961440+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/routes.ts

## Purpose

Defines the Express route table for the antibot module. It exposes a single public endpoint (`GET /challenge`) that delivers the challenge configuration a self-hosted provider needs to render its widget. The route is intentionally stateless and write-free, so it is bounded only by the global burst brake in `app/security.ts`.

## Key elements

- **`router`** (exported `Router`) — The Express router instance. Mounts the antibot endpoints on the application.
- **`GET /challenge`** — The sole route; delegates to `getAntibotChallenge`. Returns 404 when the active provider issues no challenge.

## Relationships

- **`src/modules/antibot/controllers/get-antibot-challenge.ts`** — Imported and used as the handler function for `GET /challenge`. This file is the sole request handler in the route table.
- **`src/modules/antibot/module.ts`** — Upstream consumer that mounts this `router` onto the parent Express app (standard module-mount pattern).

## Notes

- The path is `/challenge`, not `/config`. The module doc comment references `GET /config` as the client-facing path, implying the parent mount prefix is `/antibot` and the full path becomes `/antibot/challenge` — but the client-facing name is "config."
- Because the handler writes nothing, the only rate-limiting protection is the global burst brake; there is no per-route throttle here.
