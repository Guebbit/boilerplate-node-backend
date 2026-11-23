---
source: src/modules/payments/index.ts
generated_at: 2026-11-22T06:45:27.160613+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/index.ts

## Purpose
Public barrel for the payments module. Per its doc comment, it is the only surface a sibling module may import. It re-exports the module's services, domain, events, emails and model types. `paymentRepository` and the model's runtime stay internal. All writes must go through the provider-confirmed choreography in `services/settlement.ts`, never through a direct document write from outside.

## Key elements
- `export * from './services'`: public service functions.
- `export * from './domain'`: domain exports.
- `export * from './events'`: payments event exports.
- `export * from './emails'`: payments email exports.
- `export type * from './model'`: model types only. The model's runtime values are deliberately not exported.

## Relationships
- Re-exports `src/modules/payments/services/index.ts`, `src/modules/payments/domain/index.ts`, `src/modules/payments/events.ts`, `src/modules/payments/emails.ts` and `src/modules/payments/model.ts` (types only).
- Other modules linked to it in the graph include `src/modules/cart/services/checkout.ts`, `src/modules/invoicing/module.ts`, `src/modules/invoicing/services/issue-credit-note.ts` and `src/modules/returns/module.ts`.
- Several tests also depend on it: `src/modules/account/tests/contract/shop.contract.test.ts`, the cart integration tests (`src/modules/cart/tests/integration/checkout-interleavings.test.ts`, `src/modules/cart/tests/integration/product-removal-protects-orders.test.ts`) and the invoicing integration tests (`src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts`, `src/modules/invoicing/tests/integration/issue-credit-note.test.ts`).
- `scenarios/support/doubles/payments/levers.ts` is also linked to it in the graph.

## Notes
- The barrel contains no logic, only re-exports.
- Using `export type *` for the model keeps the runtime model and `paymentRepository` out of the public surface.
- The doc comment also references two documentation pages on the "published language — the barrel" and the payments module's neighbourhood.
