---
source: src/modules/antibot/index.ts
source_sha256: 0facc8744803abb9d7dcca634642fd1b44fbe27a93a4d5acb389015bed7180cd
context_sha256: c82af5afe51a0ca631509a523a597ca2b2571571dcf73db93f01143433eba04b
generated_at: 2026-11-22T04:19:14.083646+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/antibot/index.ts

## Purpose
Public barrel for the antibot module. It is the only surface sibling modules may import, and it publishes the service that `GET /config` composes. Everything else the module owns (`module.ts`, `routes.ts`, `controllers/`) is internal wiring and is deliberately not exported.

## Key elements
- `export * from './service'`: the file's only statement. It re-exports the whole public API of `./service`.

## Relationships
- `src/modules/antibot/service.ts`: the sole source of the barrel's exports. Whatever `service.ts` exports becomes the module's public surface.
- `src/app/config-routes.ts`: consumes the module through this barrel, since `GET /config` composes the published service.

## Notes
- The human-challenge gate is not exported from here. It is a cross-cutting middleware (`humanChallengeGate`). `account` and `tasks` import `infrastructure/http/middlewares/human-challenge` and `infrastructure/adapters/antibot` directly, not this module.
- Do not add exports for `module.ts`, `routes.ts`, or `controllers/` to this barrel.
