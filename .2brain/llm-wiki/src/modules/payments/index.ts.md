---
source: src/modules/payments/index.ts
sha256: 6b108e6428e32661d42f166838a13220322ff9e3745449c9bbe0fbce097e6806
generated_at: 2026-11-08T07:21:19.681236+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/index.ts

## Purpose

Public barrel (barrel export) for the payments module. It is the **only** import surface that sibling modules are permitted to use, enforcing the strategic-DDD rule documented in `docs/theory/strategic-ddd.md` §5. Internals such as `paymentRepository` and the model's runtime stay hidden; all writes are routed through the provider-confirmed choreography in `services/settlement.ts` rather than exposed as direct document writes.

## Key elements

- **`export * from './services'`** — re-exports all service functions (including `settlement` choreography) so callers never reach into the repository directly.
- **`export * from './domain'`** — re-exports domain entities, value objects, and business rules.
- **`export * from './events'`** — re-exports payment domain event definitions.
- **`export * from './emails'`** — re-exports payment-related email template builders.
- **`export type * from './model'`** — type-only re-export of the persistence model (interfaces / types), intentionally **not** a value export, keeping the runtime model private.

## Relationships

- **Downstream (re-exported):** `./services`, `./domain`, `./events`, `./emails`, `./model` — this file exists solely to aggregate them into one import path.
- **Upstream consumers (sibling modules):** `src/modules/cart/services/checkout.ts`, `src/modules/invoicing/module.ts`, `src/modules/invoicing/services/issue-credit-note.ts`, `src/modules/returns/module.ts` all import from this barrel rather than reaching into sub-paths.
- **Test / double surfaces:** `scenarios/support/doubles/payments/levers.ts` and the various integration/contract tests (`checkout.interleavings`, `product-removal-protects-orders`, `credit-note-catch-up`, `issue-credit-note`, `shop.contract`) depend on the types and service signatures exposed here.

## Notes

- The `export type *` (type-only) on `./model` is deliberate: importing a *value* from `./model` outside the module would bypass the settlement choreography. If you find yourself needing a runtime symbol from the model, it's a sign the service layer is missing a function.
- This file is a pure re-export; it contains no logic, no side effects, and no runtime code of its own. It can be read in under a second, but the barrel boundary it enforces is the whole point.
- Reference doc: `docs/modules/payments.md`.
