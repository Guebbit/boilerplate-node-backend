---
source: src/modules/payments/services/index.ts
sha256: 98f6e6efaf9704ca09a59a1f66642eafb8029ca38f69d21a7993787199dc5f82
generated_at: 2026-11-08T07:26:35.178004+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/index.ts

## Purpose

Barrel file that assembles every payment-flow function from the sibling modules (`intent`, `settlement`, `refunds`, `effects`, `offline`, `transfer`, `notify`, `scope`, `view`, `retention`, `list`, `stats`, `deadline`) into a single `paymentService` handle. It exists so callers import one name instead of reaching into a dozen sub-files, and so the module's public surface is explicitly curated — internal choreography functions are deliberately left out.

## Key elements

- **`paymentService`** — the single exported object (≈35 keys) that bundles intent creation, settlement confirmation/sync, webhook delivery/settlement, refund lifecycle (open, send, settle-by-hand, cancel), effect retries, offline recording, transfer opening, notification mails, scope helpers, view/presentation helpers, retention/export ops, list queries, stats, and config reads.
- **Re-exported types** — `RefundLeftOpenError`, `OfflinePaymentInput`, `OpenedReturnRefund`, `MixRow`, `PaymentMethodInfo`.
- **`paymentAttentionMinutes`** — re-exported scalar from `../config`.
- **Explicitly *not* published** — `settlePayment`, `performRefund`, `refundForOrder`, `cancelOpenIntentForOrder` are internal choreography behind guarded "door" functions; exposing them would let callers skip scope checks, the own-money rule, and the order-state gate.

## Relationships

- **`src/modules/payments/config.ts`** — source of `listPaymentMethods` and `paymentAttentionMinutes`, both surfaced through this file.
- **Controllers** (`get-order-payments.ts`, `get-payment-attention.ts`, `get-payment.ts`, `get-payments.ts`, `get-refund.ts`, `get-refunds.ts`) — primary consumers; they call `paymentService` methods to read or present payment/refund records.
- **`src/modules/cart/services/checkout.ts`** — downstream caller that triggers `createIntent` / `confirmPayment` during the checkout flow.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — interacts with the refund side (`refundPayment`, `openReturnRefund`) when issuing a credit note.
- **Test & scenario files** (`shop.contract.test.ts`, `checkout-interleavings.test.ts`, `product-removal-protects-orders.test.ts`, `credit-note-catch-up.test.ts`, `issue-credit-note.test.ts`, `levers.ts`) — exercise the exported service surface for contract, integration, and test-double purposes.

## Notes

- The `paymentService` object is the **only** runtime export besides the type re-exports and `paymentAttentionMinutes`. Do not import sub-files directly in application code; go through this handle so the curated surface is respected.
- The file's module doc-comment encodes the invariants (pending-order gate, at-most-once refund via `amountRefunded` conditional write, webhook-as-authority) — useful context when adding new flows.
- Sub-file layout is one-file-per-flow per `docs/theory/layers.md`; adding a new flow means adding a sibling file and listing it here.
