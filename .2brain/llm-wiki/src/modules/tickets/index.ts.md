---
source: src/modules/tickets/index.ts
sha256: b50210e3d26d47c72cf9c232ccf49aac900cfa11a2eb3af36ccff6603bb791f3
generated_at: 2026-10-29T06:03:37.729537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/index.ts

## Purpose

Public barrel file for the tickets module. It is the **only** import surface that sibling modules (e.g. notifications) may use, per the rule in `docs/theory/strategic-ddd.md` §5. It re-exports the module's sub-files so consumers never reach into internal paths directly.

## Key elements

- `export * from './service'` — re-exports all runtime values (and types) from the ticket service.
- `export * from './domain'` — re-exports the domain layer (aggregates, value objects, etc.).
- `export * from './emails'` — re-exports email-building/template logic.
- `export type * from './model'` — re-exports **types only** (no runtime values) from the model definitions.
- `export * from './events'` — re-exports domain event types and factories.

## Relationships

- **Re-exports from** (upstream within the same module): `domain/index.ts`, `emails.ts`, `events.ts`, `model.ts`, `service.ts`.
- **Imported by** (downstream sibling modules & tests):
  - `src/modules/notifications/module.ts`
  - `src/modules/notifications/services/subscribers.ts`
  - `src/modules/notifications/tests/integration/ticket-alerts.test.ts`
  - `src/modules/notifications/tests/unit/staff-routing.test.ts`
  - `tests/cross-cutting/ticket-kinds-are-not-notification-kinds.test.ts`

## Notes

- `model` is exported with `export type *`, so no runtime bindings are pulled from it. Importing a value from `./model` via this barrel would fail at runtime.
- Sibling modules must import from **this file** (or `@/modules/tickets`), not from `./service` or `./domain` directly. Bypassing the barrel violates the DDD boundary rule referenced in the header comment.
- For fuller context, see `docs/modules/tickets.md` (linked in the header comment).
