---
source: src/modules/stock-alerts/index.ts
sha256: 9d8474634f9bcf576301d2acfdca9141e74860edd8c9503dcde44e9967696eee
generated_at: 2026-10-29T05:58:15.710489+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/index.ts

## Purpose

Public barrel (module facade) for the **stock-alerts** bounded context. It is the *only* import surface other modules or sibling modules are allowed to use, enforcing the DDD rule documented in `docs/theory/strategic-ddd.md` §5. Sibling modules never reach into internal files (`service.ts`, `events.ts`, etc.) directly.

## Key elements

- **`export * from './service'`** — Re-exports all runtime values (the stock-alerts service and its public API).
- **`export * from './events'`** — Re-exports domain/application event types and constructors.
- **`export * from './emails'`** — Re-exports email-building logic (templates, payload shaping) used by notifications.
- **`export type * from './model'`** — Re-exports **types only** from the aggregate/entity model, so consumers can reference types without importing runtime code.

## Relationships

- **`src/modules/notifications/module.ts`** — Consumes the stock-alerts public surface (likely events and emails) to react to alert triggers.
- **`src/modules/notifications/tests/integration/events.test.ts`** — Imports stock-alerts events through this barrel to verify the notification pipeline.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Imports email helpers from this barrel to assert rendered mail output.
- **`src/modules/stock-alerts/service.ts`**, **`events.ts`**, **`emails.ts`**, **`model.ts`** — Internal implementation files whose exports are aggregated here; they are not imported directly by external consumers.

## Notes

- `model` is re-exported with `export type *` (type-only), so it contributes **zero runtime exports**. Do not add a `require`-style import of `model` through this barrel expecting a value.
- The barrel deliberately exposes *everything* from `service`, `events`, and `emails`. If a file in those three is meant to be internal, it must not be exported from those files.
- The module doc-comment points to `docs/modules/stock-alerts.md` for narrative context beyond what this file shows.
