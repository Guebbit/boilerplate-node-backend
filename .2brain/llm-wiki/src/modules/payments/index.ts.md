---
source: src/modules/payments/index.ts
sha256: 6b108e6428e32661d42f166838a13220322ff9e3745449c9bbe0fbce097e6806
generated_at: 2026-10-15T11:25:54.444185+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/index.ts

## Purpose

Public barrel for the Payments module. It is the **only** import surface exposed to sibling modules (enforced by the strategic-DDD rule in `docs/theory/strategic-ddd.md` §5). It re-exports services, domain logic, events, and emails by value, and re-exports the model as **types only**, keeping the model's runtime internal to the module.

## Key elements

- `export * from './services'` — re-exports all payment service functions (e.g. settlement choreography).
- `export * from './domain'` — re-exports domain logic.
- `export * from './events'` — re-exports payment event definitions.
- `export * from './emails'` — re-exports payment email helpers.
- `export type * from './model'` — re-exports **type declarations only** (no runtime values) from the payment model.

## Relationships

- **Internal (re-exported from):** `services/index.ts`, `domain/index.ts`, `events.ts`, `emails.ts`, `model.ts`.
- **External consumers (import via this barrel):** `cart/services/checkout.ts`, `returns/services/cancel-remainder.ts`, `returns/services/receive.ts`, `invoicing/module.ts`, `scripts/ops/reap-payments.ts`, `scripts/ops/sweep-payment-effects.ts`, and the related test files in `account/tests`, `invoicing/tests`, and `returns/tests`.

## Notes

- `model` is exported with `export type *`, so importing a runtime value from it will silently fail at the type level. This is intentional: the model's runtime stays inside the module.
- All writes to payment documents must go through the provider-confirmed choreography in `services/settlement.ts`. Direct document writes from outside the module are prohibited by convention.
- Refer to `docs/modules/payments.md` for the full module design doc.
