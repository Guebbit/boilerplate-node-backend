---
source: src/modules/payments/services/index.ts
sha256: d6a5389d665632ae48963a774230f3ac57bfc96c544c5043e33889741f9123af
generated_at: 2026-09-23T19:20:54.206888+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/index.ts

## Purpose

Barrel (index) file for the payments services folder. It re-exports every public operation from the sibling service modules (`intent`, `settlement`, `refunds`, `offline`, `view`, `retention`, `lookup`, `scope`) plus `listPaymentMethods` from `../config`, and bundles the core operations into a single `paymentService` object. It exists so that `module.ts` can wire event listeners and downstream consumers (controllers, ops scripts, the cart checkout flow) can import a stable, named surface without reaching into individual service files.

## Key elements

- **`paymentService`** (const) — the module's single service handle; aggregates `createIntent`, `confirmPayment`, `syncPayment`, `applyWebhookDelivery`, `applyWebhookSettlement`, `getForOrder`, `refundForOrder`, `refundByOrder`, `recordOfflinePayment`, `getOrderByReference`, `detachUserId`, `findOwnPayments`, `reapAbandonedPayments`, `listPaymentMethods`.
- **Named re-exports** — every operation is also published as a top-level named export (e.g. `settlePayment`, `performRefund`, `REFUNDABLE_PAYMENT_STATUS`, `withActions`, `callerScope`, `OfflinePaymentInput`, `PaymentMethodInfo`). The file comment states this is intentional so the folder-split does not become a breaking change relative to the prior single-file layout.
- **Docstring (module-level JSDoc)** — documents the four domain invariants: only a `pending` order's owner starts a payment; the order's move to `paid` is the gate (provider answers first, slipped orders are refunded on the spot); a refund is the `ORDER_CANCELLED` listener made at-most-once by the conditional `succeeded → refunded` move; the provider webhook is the authority, the browser confirmation is a hint.

## Relationships

- **`src/modules/payments/config.ts`** — imports `listPaymentMethods` and the `PaymentMethodInfo` type; re-exports both.
- **`src/modules/payments/services/intent.ts`** — imports `createIntent`; re-exports it.
- **`src/modules/payments/services/lookup.ts`** — imports `getOrderByReference`; re-exports it.
- **`src/modules/payments/services/settlement.ts`, `refunds.ts`, `offline.ts`, `view.ts`, `retention.ts`, `scope.ts`** — all re-exported by name (these are referenced in the file's import/export statements).
- **`src/modules/payments/module.ts`** — the file comment notes `module.ts` consumes `refundForOrder` and `detachUserId` to wire the `ORDER_CANCELLED` and user-detach event listeners.
- **`src/modules/payments/index.ts`** — parent barrel that further re-exports from this file to the module's public API.
- **Controllers** (`post-payment-intent`, `post-payment-confirm`, `post-payment-webhook`, `post-payment-refund`, `post-payment-offline`, `post-payment-sync`, `get-payment-by-order`, `get-order-by-reference`) — consume the named exports defined here as their handler logic.
- **`scripts/ops/reap-payments.ts`** — drives `reapAbandonedPayments` directly for the abandoned-payment sweep.
- **`src/modules/cart/services/checkout.ts`** — calls `createIntent` to start the payment for a pending cart order.

## Notes

- This is a **pure re-export file**; it contains no business logic of its own. All behaviour lives in the sibling `./` files.
- The barrel publishes **both** a named-export surface **and** the `paymentService` object. Consumers may use either; they are the same underlying functions. Reducing either set would be a breaking change (stated in the inline comment).
- The file was split out of a ~700-line single file; the docstring cross-references `docs/theory/layers.md` for the rationale.
- `settlePayment` is exported but **not** included in the `paymentService` object — it is the internal choreography reached via `confirmPayment`, `applyWebhookDelivery`, and `applyWebhookSettlement`, but is also published for the ops/test suites.
