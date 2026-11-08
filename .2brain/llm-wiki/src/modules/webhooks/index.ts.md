---
source: src/modules/webhooks/index.ts
sha256: 3a74afade6274293d41eabce0f37b59ba2c2e2572ecdd546206824769aca5193
generated_at: 2026-11-08T09:02:58.435331+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/index.ts

## Purpose

Public barrel (module façade) for the webhooks module. By strategic-DDD convention (`docs/theory/strategic-ddd.md` §5), this file is the **only** import surface available to sibling modules. It re-exports the public API from `services`, `domain`, and `events`, plus the type definitions from `model`, while deliberately keeping `module.ts` (manifest entry) and `secrets.ts` internal.

## Key elements

- **`export * from './services'`** — re-exports the service-layer functions of the webhooks module.
- **`export * from './domain'`** — re-exports the domain model / domain services defined in `domain/index.ts`.
- **`export * from './events'`** — re-exports event definitions (e.g., domain-event types or publishers) from `events.ts`.
- **`export type * from './model'`** — re-exports *types only* (no runtime values) from `model.ts`, keeping the type surface separate from the value surface.

No logic, side-effects, or runtime code live in this file; it is purely declarative re-exporting.

## Relationships

- **`src/modules/webhooks/services/index.ts`** — source of the value exports under `./services`.
- **`src/modules/webhooks/domain/index.ts`** — source of the value exports under `./domain`.
- **`src/modules/webhooks/events.ts`** — source of the value exports under `./events`.
- **`src/modules/webhooks/model.ts`** — source of the type-only exports under `./model`.
- **`src/modules/notifications/module.ts`** — sibling module that imports its webhooks dependencies *through* this barrel (the single allowed entry point).
- **`src/modules/notifications/tests/integration/staff.test.ts`** — integration test that resolves webhooks symbols via this barrel.

## Notes

- **`module.ts` is intentionally absent.** The domain-event subscription and queue consumer are registered on the module's own manifest entry and do not run at import time. They are not part of the public barrel.
- **`secrets.ts` is intentionally absent.** Signing/encrypting a delivery secret is an internal concern; no sibling should call it.
- The `export type *` syntax on `model` ensures consumers cannot accidentally pull runtime values from that file, and tree-shaking can eliminate the module entirely if only types are used.
