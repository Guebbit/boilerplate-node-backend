---
source: src/modules/antibot/module.ts
sha256: 5c982c9c765dcfe686500cc407b5ebbfbc68930e48b7f8fd75901fc8aa47905e
generated_at: 2026-10-14T14:56:55.742232+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/module.ts

## Purpose

Module manifest for the `antibot` module. It registers two public HTTP routes (served under `/antibot`) that expose which human-challenge provider is active, letting a frontend decide whether to render a challenge widget before submitting a guarded form. The module is intentionally stateless — it carries no persistence or locale data — and performs no boot-time checks of its own, because the actual challenge gate (`humanChallengeGate`) is cross-cutting middleware that runs regardless of whether this module's routes are mounted.

## Key elements

- **`default` export** — A plain object satisfying `AppModule` (from `@kernel/registry`) with:
  - `name: 'antibot'`
  - `basePath: '/antibot'`
  - `routes: router` (imported from `./routes`)
  - `personalData: 'none'` — signals that the module handles no personal data (the caller, by construction, has no account yet).
- **`router`** (imported from `./routes.ts`) — The Express/Hono router containing the module's two public endpoints; attached to the manifest so the kernel can mount it.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type that the default export satisfies. This is the structural contract the kernel uses to mount modules.
- **`src/modules.ts`** — The aggregation point that collects module manifests (including this one) for the application bootstrap.
- **`src/modules/antibot/routes.ts`** — Supplies the `router` that this manifest references; the actual HTTP handlers live there, not here.

## Notes

- The actual challenge enforcement (`humanChallengeGate`) is **not** in this module. The `account` and `feedback` modules depend on `infrastructure/adapters/antibot-providers` directly for the gate. This manifest only publishes provider-selection info to the frontend.
- Provider validation (secrets, selection) happens in `app/config.ts`, not here, because the middleware gate keeps running even if this module's routes are unmounted.
- See `docs/modules/antibot.md` for the full design rationale.
