---
source: src/modules/payments/services/index.ts
sha256: e3aa5b820886c2eaf445c0b6b89668861a3b6677c5737f1a6ddde6beb1437675
generated_at: 2026-10-15T11:29:45.323978+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/index.ts

## Purpose

Barrel file that publishes the public API of the payments service folder. It re-exports every operation callers may use from a single import path so that controllers, event modules, and tests never reach into individual sub-files (`intent.ts`, `settlement.ts`, `refunds.ts`, etc.). It also assembles the `paymentService` object handle for callers that prefer a single named reference.

## Key elements

- **Named re-exports** — every public operation is exported by name from its sub-module: `createIntent`, `cancelOpenIntentForOrder` (intent); `confirmPayment`, `syncPayment`, `applyWebhookDelivery`, `applyWebhookSettlement` (settlement); `refundByOrder`, `refundForOrder`, `refundForReturn` (refunds); `retryOpenRefunds`, `reconcileStalePayments` (effects); `recordOfflinePayment` (offline); `getForOrder`, `withActions` (view); `detachUserId`, `findOwnPayments`, `findOwnPaymentsForExport`, `reapAbandonedPayments` (retention); `callerScope`, `payerScope`, `buyerOrderScope`, `readsAllPayments` (scope); `getOrderByReference` (lookup); `listPayments`, `listRefunds`, `listAttention` (list); `methodMix` (stats); `mailPaymentReceived`, `mailRefundIssued` (notify); `listPaymentMethods` (config).
- **`paymentService`** — a plain object bundling the most commonly used operations under one name, described as "the module's one service handle."
- **Deliberately *not* exported:** `settlePayment` and `performRefund` are internal choreography behind the guarded "door" functions (`confirmPayment`, `syncPayment`, `applyWebhookSettlement`, `refundByOrder`, etc.). Bypassing the doors would skip scope checks, the own-money rule, and the order-state gate.

## Relationships

- **Controllers** (`post-payment-confirm`, `post-payment-intent`, `post-payment-offline`, `post-payment-refund`, `post-payment-sync`, `get-payments`, `get-refunds`, `get-payment-attention`, `get-payment-by-order`, `get-order-by-reference`) import their operations from this file.
- **`src/modules/cart/services/checkout.ts`** consumes the intent/confirm path (e.g. `createIntent`, `confirmPayment`) to drive the buyer-side payment flow.
- **`scripts/ops/reap-payments.ts`** calls `reapAbandonedPayments` for periodic cleanup of stale pending payments.
- **`scripts/ops/sweep-payment-effects.ts`** calls `retryOpenRefunds` / `reconcileStalePayments` to re-attempt settlements that died mid-flight.
- **`src/modules/payments/config.ts`** is re-exported through this file (`listPaymentMethods`, `PaymentMethodInfo`) so callers get it from the same entry point.
- **`src/modules/invoicing/tests/integration/issue-credit-note.test.ts`** drives the refund operations directly (named-export style), per the module's stated convention that suites call operations by name.
- An events/`module.ts` wiring (referenced in comments) imports `refundForOrder` and `detachUserId` by name to attach them to `ORDER_REFUND_OWED` and similar triggers.

## Notes

- **Dual export pattern is load-bearing.** Both the named exports *and* the `paymentService` object exist because two distinct call sites need each shape: the event-wiring module and the integration suites use named imports; other callers prefer the object. Removing either breaks one of those call sites.
- **Scope/permission guards live in the "door" functions**, not in the re-export layer. This file performs no validation; it only surfaces the API.
- The file is a folder-level barrel, not a single implementation. The doc comment links to `docs/theory/layers.md` for the rationale on why the service was split into sub-files at ~700 lines.
