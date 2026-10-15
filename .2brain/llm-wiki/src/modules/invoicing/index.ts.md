---
source: src/modules/invoicing/index.ts
sha256: 8e45d327f6c3b7a8a8aae4515db291ba30fd7d41737e5f332bbf170bab79278b
generated_at: 2026-10-15T10:38:28.535616+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/index.ts

## Purpose

Public barrel for the invoicing module. It is the **only** import surface that sibling modules (payments, returns, stats, etc.) are permitted to use, per the strategic DDD rule (`docs/theory/strategic-ddd.md` §5). It re-exports the module's services, domain types, email helpers, and model types while keeping the `invoicingRepository` and model runtime internals private to this module.

## Key elements

- `export * from './services'` — re-exports all runtime service functions/classes from `src/modules/invoicing/services/index.ts`.
- `export * from './domain'` — re-exports the domain layer from `src/modules/invoicing/domain/index.ts`.
- `export * from './emails'` — re-exports email-related helpers from `src/modules/invoicing/emails.ts`.
- `export type * from './model'` — re-exports **types only** from `src/modules/invoicing/model.ts` (no runtime values leak out).

## Relationships

- **Re-exports (direct):** `services/index.ts`, `domain/index.ts`, `emails.ts`, `model.ts`. This file is their sole public aggregation point.
- **Consumed by sibling modules:** `stats/services/breakdowns.ts`, `stats/services/sales.ts`, and integration tests in `payments`, `returns`, and `stats` import through this barrel rather than reaching into sub-files.

## Notes

- The type-only export of `./model` is deliberate: sibling modules can *read* invoice/credit-note types but cannot obtain the models' runtime constructors or repository, preventing external writes.
- The doc comment states the models are "frozen only from this module's own event listeners," meaning mutation control is an internal concern, not a public API guarantee.
- Any new public surface for invoicing must be routed through this file; importing sub-paths directly from outside the module violates the stated DDD boundary.
