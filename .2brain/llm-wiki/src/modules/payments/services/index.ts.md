---
source: src/modules/payments/services/index.ts
sha256: f6d8d2e0700af59a58060049d0921c2a6f35f7be9a54e2b171fd52655cefe5d4
generated_at: 2026-09-27T15:26:05.967075+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/index.ts

## Purpose

Barrel file that re-exports every payment-service operation (intent, settlement, refunds, effects, offline, view, retention, scope, lookup) and the `listPaymentMethods` helper from config. It exists so that consumers—controllers, the module's event wiring, and ops scripts—can import from one stable path rather than reaching into individual sibling files. The file was split out of a single 700+-line module (see `docs/theory/layers.md`) and this index is the public seam of the services folder.

## Key elements

- **Named re-exports** — Every function is published individually (`createIntent`, `settlePayment`, `refundForOrder`, `retryPendingEffects`, `recordOfflinePayment`, `getForOrder`, `detachUserId`, `findOwnPayments`, `findOwnPaymentsForExport`, `reapAbandonedPayments`, `callerScope`, `getOrderByReference`, `listPaymentMethods`, etc.) so that `module.ts` can wire specific handlers into events and test suites can drive operations directly.
- **`paymentService` object** — A single convenience handle aggregating the most common operations. Named for the record it serves (mirrors `paymentRepository`). Consumers that need "the payments service" import this one object.
- **`OfflinePaymentInput` type** — Re-exported from `./offline` for callers constructing offline payment records.
- **`PaymentMethodInfo` type** — Re-exported from `../config`.
- **`REFUNDABLE_PAYMENT_STATUS`** — Re-exported from `./refunds`; used to gate refund eligibility.

## Relationships

- **`src/modules/payments/module.ts`** — Imports individual named exports (specifically `refundForOrder` and `detachUserId`) to attach them as event listeners. This is the reason dual-export (named + object) is mandatory; publishing only the object would break this wiring.
- **`src/modules/payments/controllers/post-payment-intent.ts`, `post-payment-confirm.ts`, `post-payment-webhook.ts`, `post-payment-refund.ts`, `post-payment-sync.ts`, `post-payment-offline.ts`, `get-order-by-reference.ts`, `get-payment-by-order.ts`** — HTTP-layer controllers that call the operations re-exported here.
- **`src/modules/payments/config.ts`** — Source of `listPaymentMethods` and `PaymentMethodInfo`, which this index re-exports for a single import surface.
- **`src/modules/payments/services/effects.ts`** — Source of `retryPendingEffects`; this index re-exports it for external consumers.
- **`scripts/ops/reap-payments.ts`** — Ops script that imports from this index to trigger `reapAbandonedPayments` / `retryPendingEffects`.
- **`scripts/ops/sweep-payment-effects.ts`** — Ops script that drives `retryPendingEffects` via this index.
- **`src/modules/cart/services/checkout.ts`** — Checkout flow calls into the payment operations exposed here to initiate intent/confirm during the cart→order transition.
- **`src/modules/payments/index.ts`** — Parent module barrel that aggregates this services index alongside controllers and types for the public module API.

## Notes

- **Dual export is intentional and load-bearing.** The comment in the file states that publishing only the `paymentService` object would break both `module.ts`'s event wiring and the test suites. Do not collapse to object-only exports.
- **`settlePayment` is the single settlement path.** Both the webhook-driven and browser-driven paths converge on it (via `confirmPayment` / `applyWebhookSettlement`). There is deliberately no second settlement routine; two copies would risk committing inventory twice.
- **The folder, not this file, is the unit of change.** When adding a new payment operation, create the implementation in a sibling file (e.g., `./intent.ts`) and add the re-export here; do not implement logic in this index.
