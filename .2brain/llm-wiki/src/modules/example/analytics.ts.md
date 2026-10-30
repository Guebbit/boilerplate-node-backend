---
source: src/modules/example/analytics.ts
sha256: 934735631a7a2fa9594ae50ca1966f0cdc4679cb79b283d6e0bcd7918ea00675
generated_at: 2026-10-29T03:50:55.197754+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/analytics.ts

## Purpose

Declares the analytics event names that the *example* module is allowed to fire, by re-exporting a generated constant and augmenting the app-wide `AnalyticsEventMap` type. This is the single source of truth for which events belong to this module; the app-level union of all analytics events grows automatically from each module that includes this file.

## Key elements

- **`exampleAnalyticsEvents`** (re-export from `./rules.generated`) — the generated object of event names (e.g. `example_published`) produced from `rules.yaml`.
- **`declare module '@infrastructure/observability/analytics'`** — module augmentation that adds an `example` key to the global `AnalyticsEventMap` interface, constraining the value to the union of the generated event-name keys.

## Relationships

- **`src/modules/example/rules.generated.ts`** — upstream source of `exampleAnalyticsEvents`; this file both imports it (for the augmentation) and re-exports it so consumers can reference the names directly from `analytics.ts`.
- **`src/modules/example/services/transition.ts`** — the service layer that calls `emitAnalyticsEvent` with these names at runtime (the file's header notes to drop that call if this file is deleted).
- **`src/modules/example/tests/unit/analytics.test.ts`** — unit tests exercising this module's exports and augmentation.

## Notes

- This file is intentionally tiny by design. If a module has no analytics events, the whole file (and the corresponding `emitAnalyticsEvent` call at the emit site) should be deleted — do not leave an empty augmentation.
- Event names come from `rules.generated.ts`, which is regenerated from `rules.yaml`. Edit `rules.yaml`, not this file, to add or remove events.
- The naming convention is documented at `docs/tools/analytics.md#naming`.
