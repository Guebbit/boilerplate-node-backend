---
source: src/modules/antibot/module.ts
source_sha256: 4617b4249632cf5a24e7c59e91df09c4e5187e171c29671542ec9aa8e77c3a5d
context_sha256: bd6206690e60f014361a500cdbc419a9830c0067f7c522024b5cdb5e1d340064
generated_at: 2026-11-22T04:19:23.871929+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/antibot/module.ts

## Purpose
Manifest for the `antibot` module. It publishes which human-challenge provider is active, so a frontend knows whether to render a challenge widget before submitting a guarded form. It declares one public route and nothing else.

## Key elements
- **Default export**: an object satisfying `AppModule`, with these fields:
  - `name: 'antibot'`
  - `mounts`: a single entry, `{ basePath: '/antibot', routes: router }`
  - `personalData: 'none'`. The module has no persistence and collects nothing, because the challenge is issued to a caller who has no account yet.

## Relationships
- `src/kernel/registry.ts`: provides the `AppModule` type. The manifest is checked against it with `satisfies`.
- `src/modules/antibot/routes.ts`: provides the `router` that is mounted at `/antibot`.
- `src/modules.ts`: not imported here. By its name it is probably where module manifests like this one are collected. The file itself doesn't show that.

## Notes
- The module has no boot-time checks. `src/app/config.ts` validates the provider selection and its secrets.
- The actual gate is the cross-cutting middleware `humanChallengeGate`. `account` and `tasks` depend directly on `infrastructure/adapters/antibot-providers`, not on this module. The gate keeps working even if this module's HTTP route isn't mounted.
- The module has no locales.
