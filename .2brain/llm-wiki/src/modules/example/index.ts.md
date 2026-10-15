---
source: src/modules/example/index.ts
sha256: 42843aa603eeb71d51851571e8e264aed8679871b76e3b54302d41831460185e
generated_at: 2026-10-15T10:30:39.402070+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/index.ts

## Purpose

Public barrel for the `example` module. It is the **only** entry point a sibling module is allowed to import from, re-exporting services, domain rules, events, emails, and the model's type surface. Everything else (repositories, model runtime values, wiring, `factories.ts`) is deliberately excluded.

## Key elements

- **`export * from './services'`** – Re-exports all service-level exports (likely use-case / application-service functions).
- **`export * from './domain'`** – Re-exports domain rules (value objects, entities, invariants).
- **`export * from './events'`** – Re-exports domain event definitions and helpers.
- **`export * from './emails'`** – Re-exports email template definitions and related types.
- **`export type * from './model'`** – Re-exports **types only** (no runtime values) from the model layer, keeping the model's internal implementation private to the module.

## Relationships

- **`src/modules/example/services/index.ts`** — Source of the `./services` re-export; this barrel exposes its public API to the rest of the codebase.
- **`src/modules/example/domain/index.ts`** — Source of the `./domain` re-export.
- **`src/modules/example/events.ts`** — Source of the `./events` re-export.
- **`src/modules/example/emails.ts`** — Source of the `./emails` re-export.
- **`src/modules/example/model.ts`** — Source of the type-only re-export; its runtime values are **not** exposed.
- **`tests/cross-cutting/webhook-event-producers.test.ts`** — Consumes event exports through this barrel.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Consumes email exports through this barrel.

## Notes

- The distinction between `export *` and `export type *` is intentional and load-bearing: the model's runtime values (e.g. factory functions, class instances) are intentionally **not** part of the public surface. Importing a model value directly from a sibling is a boundary violation.
- The JSDoc header references `docs/theory/strategic-ddd.md` as the canonical explanation of *why* the module is shaped this way.
- Adding a new `export * from '…'` line to this file widens the module's public API. Do so only when the neighbor truly needs that symbol; prefer adding it to a more specific sub-barrel and re-exporting selectively.
