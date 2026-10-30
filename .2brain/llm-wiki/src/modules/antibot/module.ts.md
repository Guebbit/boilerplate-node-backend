---
source: src/modules/antibot/module.ts
sha256: a1e1aa16dd58a9de76dbc76e9749003aade0be852224888e4dc6c1a01fc61193
generated_at: 2026-10-29T03:11:59.351685+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/module.ts

## Purpose

Module manifest for the **antibot** module. Its job is minimal: declare two public HTTP routes (at `/antibot`) that expose which human-challenge provider is active, so a frontend can decide whether to render a challenge widget before submitting a guarded form. The actual enforcement gate (`humanChallengeGate`) is a cross-cutting middleware owned elsewhere; this module only handles the "tell the caller what to expect" side.

## Key elements

- **Default export** — the module manifest object, typed as `satisfies AppModule`. Contains:
  - `name: 'antibot'`
  - `mounts` — a single entry mounting `router` (from `./routes.ts`) at basePath `/antibot`.
  - `personalData: 'none'` — explicitly no persistence, no collection, no locales.
- **`router` import** — pulled from `./routes.ts`; the only runtime dependency in this file.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type (imported as a type) that the default export satisfies. This is the contract every module manifest must meet.
- **`src/modules/antibot/routes.ts`** — supplies the `router` instance that this manifest mounts. The actual endpoint logic lives there, not here.
- **`src/modules.ts`** — upstream aggregator that presumably registers this module's manifest into the application's module list.

## Notes

- This file intentionally carries **no boot-time checks**. Validation of the provider selection and its secrets is handled by `app/config.ts`, because the `humanChallengeGate` middleware keeps running even if this module's routes are unmounted.
- Other modules (`account`, `tickets`) depend on `infrastructure/adapters/antibot-providers` directly for the gate — they do **not** import from this module. Don't assume adding logic here will affect those call sites.
- The doc comment references `docs/modules/antibot.md` for broader context on the anti-automation flow.
