---
source: src/modules/invoicing/index.ts
sha256: 8e45d327f6c3b7a8a8aae4515db291ba30fd7d41737e5f332bbf170bab79278b
generated_at: 2026-11-08T06:11:14.673061+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/index.ts

## Purpose

Public barrel for the invoicing module. It is the **only** import surface available to sibling modules (per `docs/theory/strategic-ddd.md` §5), re-exporting the module's services, domain, emails, and model types while keeping all runtime write-path (repository, model instantiation) internal.

## Key elements

- `export * from './services'` — re-exports the services barrel (`src/modules/invoicing/services/index.ts`).
- `export * from './domain'` — re-exports the domain barrel (`src/modules/invoicing/domain/index.ts`).
- `export * from './emails'` — re-exports email template/utility exports (`src/modules/invoicing/emails.ts`).
- `export type * from './model'` — **type-only** re-export of model definitions (`src/modules/invoicing/model.ts`); no runtime values leak out.

## Relationships

- **Re-exports (direct children):** `services/index.ts`, `domain/index.ts`, `emails.ts`, `model.ts` (types only).
- **Consumers (graph neighbors that import through this barrel):**
  - `src/modules/stats/services/breakdowns.ts`, `src/modules/stats/services/sales.ts` — read invoicing types/services for aggregation.
  - Test suites across other modules (`shop.contract.test.ts`, `settlement-mismatch.test.ts`, `receive.test.ts`, `withdrawal-before-dispatch.test.ts`, `stats.test.ts`, `bought-returned-refunded.test.ts`) — exercise the public API exported here.

## Notes

- The `export type *` syntax on `model` is deliberate: external code can reference invoice/credit-note shapes but **cannot** instantiate or mutate them. All writes stay inside the module's own event listeners.
- If a sibling module needs a new invoicing export, it must be added through one of the four re-export lines here; there is no second entry point.
