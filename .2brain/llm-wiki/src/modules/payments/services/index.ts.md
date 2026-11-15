---
source: src/modules/payments/services/index.ts
sha256: ef74c073b6195ef9620a9537f250a9c192e523d673a9bdd16f805c59cb16ddf1
generated_at: 2026-11-14T21:06:37.945945+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/index.ts

## Purpose

Barrel/facade for the payments domain service. It re-exports the public surface of every sub-module (intent, settlement, refunds, effects, offline, transfer, notify, scope, view, retention, list, stats, deadline) under a single `paymentService` object, so callers never import from the individual files. The module-level doc comment encodes the domain invariants: the order's `paid` transition is the gate (not the charge), refunds are at-most-once via conditional write on `amountRefunded`, and the provider webhook is the authority for settlement.

## Key elements

- **`paymentService`** — the single public handle. A flat object exposing ~35 functions and helpers across all sub-modules. Named for the record it serves (analogous to `paymentRepository`).
- **Re-exported errors** — `RefundLeftOpenError`, `WebhookProviderUnknownError` from `./errors`.
- **Re-exported types** — `OfflinePaymentInput`, `OpenedReturnRefund`, `MixRow`, `PaymentMethodInfo`.
- **`paymentAttentionMinutes`** — re-exported from `../config` at the module level (not inside `paymentService`).
- **Deliberately *not* exported** — `settlePayment`, `applyWebhookDelivery`, `performRefund`, `refundForOrder`, `cancelOpenIntentForOrder`. These are internal choreography steps that carry scope/guard logic; exposing them would let callers skip the guards.

## Relationships

- **`src/modules/payments/config.ts`** — provides `listPaymentMethods` and `paymentAttentionMinutes`, both surfaced here directly.
- **`src/modules/cart/services/checkout.ts`** — downstream consumer that imports from this module's `paymentService` handle for the checkout payment flow.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — downstream consumer that imports from this module's `paymentService` handle for credit-note refund operations.
- **`src/modules/payments/controllers/get-*.ts`** (get-order-payments, get-payment, get-payments, get-refund, get-refunds, get-payment-attention) — controllers that read through the `paymentService` view/scope functions (`getById`, `getForOrder`, `listForOrder`, `getRefund`, `listRefunds`, `listAttention`) and scope helpers (`callerScope`, `payerScope`, `buyerOrderScope`).
- **`scenarios/support/doubles/payments/levers.ts`** — test-double factory that wraps or replaces parts of `paymentService` for isolated scenario tests.
- **Test files** (`shop.contract.test.ts`, `checkout-interleavings.test.ts`, `product-removal-protects-orders.test.ts`, `credit-note-catch-up.test.ts`, `issue-credit-note.test.ts`) — exercise the service handle or its sub-module functions through the public surface defined here.

## Notes

- The object is intentionally **flat** (no sub-namespace like `paymentService.refunds.*`). Search for a function name directly; there is no prefix to disambiguate.
- Guarded-vs-unguarded split is the key convention: "doors" (e.g. `confirmPayment`, `refundPayment`) include scope checks and order-state gates; the choreography functions beneath them do not. Always call the door.
- `refundLegalDue` is the only time/deadline concern exposed here (from `./deadline`); it is a pure calculation, not a side-effecting service call.
- `listPaymentMethods` and `paymentAttentionMinutes` come from `../config`, not from a sibling service file—don't look for them under `./`-prefixed imports.
