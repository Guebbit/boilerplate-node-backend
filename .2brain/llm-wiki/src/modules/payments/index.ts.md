---
source: src/modules/payments/index.ts
sha256: cc687face756441007879701096bd8b691fc67514e2c68aeb0c208676bf57579
generated_at: 2026-09-23T19:18:12.242363+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/index.ts

## Purpose

Barrel (public entry point) for the payments module. It is the **only** surface a sibling module is allowed to import from, enforcing the strategic-DDD boundary rule (`docs/theory/strategic-ddd.md` §5). It re-exports the services, events, and model types while keeping the runtime model and `paymentRepository` internal.

## Key elements

- `export * from './services'` — re-exports the full service layer (including the provider-confirmed settlement choreography in `services/settlement.ts`).
- `export * from './events'` — re-exports domain events so external modules (e.g. webhooks) can subscribe or assert on them.
- `export type * from './model'` — **type-only** re-export of the domain model; the runtime model and repository are intentionally excluded from the public surface.

## Relationships

- **`src/modules/payments/services/index.ts`**, **`src/modules/payments/events.ts`**, **`src/modules/payments/model.ts`** — the three local files re-exported here; this file is the sole aggregate entry point to them.
- **`src/modules/cart/services/checkout.ts`** — sibling module that consumes payment services through this barrel.
- **`src/modules/webhooks/services/publish.ts`** — consumes payment events (re-exported via `./events`) to emit webhook payloads.
- **`scripts/ops/reap-payments.ts`** — operational script that reaches into the payment service layer via this entry point.
- **`src/modules/account/tests/contract/api.contract.test.ts`**, **`tests/cross-cutting/webhook-event-producers.test.ts`** — tests that exercise the payments surface exposed through this barrel.

## Notes

- The `export type *` for the model is deliberate: external code can reference payment types but **cannot** import runtime model helpers or the repository. All writes must flow through the settlement choreography in `services/settlement.ts`.
- Do not add `export * from './model'` (value export) here; that would break the encapsulation contract documented in the module header.
- Module documentation lives in `docs/modules/payments.md`; the boundary rule in `docs/theory/strategic-ddd.md` §5.
