---
source: src/modules/webhooks/index.ts
sha256: 3a74afade6274293d41eabce0f37b59ba2c2e2572ecdd546206824769aca5193
generated_at: 2026-10-29T06:27:05.987155+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/index.ts

## Purpose

Public barrel (the sole import surface) for the webhooks module. Sibling modules import only from this file, never from its internal sub-modules, per the strategic-DDD rule documented in `docs/theory/strategic-ddd.md` §5.

## Key elements

- `export * from './services'` — re-exports the webhooks service API.
- `export * from './domain'` — re-exports domain logic (entities, value objects, etc.).
- `export * from './events'` — re-exports event definitions/payloads.
- `export type * from './model'` — re-exports **types only** (no runtime values) from the model layer.

No functions, classes, or side-effecting code are defined here; the file is purely a re-export facade.

## Relationships

- **Re-exports** from `./services/index.ts`, `./domain/index.ts`, `./events.ts`, and `./model.ts` (type-only). These are the internal sub-modules this barrel aggregates.
- **Consumed by** `src/modules/notifications/module.ts` and `src/modules/notifications/tests/integration/staff.test.ts`, which import webhooks symbols exclusively through this barrel.
- **Not** re-exported: `secrets.ts` (signing/encrypting delivery secrets) and `module.ts` (manifest entry that wires the domain-event subscription and queue consumer). Both remain internal to the module.

## Notes

- `export type *` on `./model` means consumers can import *type names* from the barrel but cannot import any runtime values (e.g., class instances, enums-as-values) from `model.ts`. Use a direct import if you need a value.
- The module's manifest entry (`module.ts`) performs no work at import time; side effects (event subscription, queue consumer startup) are registered there, not here.
- `secrets.ts` is deliberately excluded from the barrel. If a sibling appears to need it, that's a design signal to revisit, not to add it to this file.
