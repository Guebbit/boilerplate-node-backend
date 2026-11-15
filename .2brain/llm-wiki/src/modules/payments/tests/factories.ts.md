---
source: src/modules/payments/tests/factories.ts
sha256: fe23ffb48e6159cd85c42e3d86b1ae5c3ef36b5b36fb1afd5f14970ad55fc7e5
generated_at: 2026-11-14T21:11:42.845410+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/factories.ts

## Purpose
Test factories that produce fully-formed payment states (a card-paid order, a pending bank-transfer order, an operator refund, a return refund) by driving the production service layer directly, so integration and contract tests can assert against the same persisted rows a real request would leave behind.

## Key elements

- **`refundForOrder`** (re-export) — Delegates to `services/refunds.ts`; the refund a cancel-listener would produce. Exposed here so sibling tests (e.g. invoicing credit-note tests) can import it without reaching into the services barrel.
- **`refundForReturn`** — Two-step return refund: opens the refund record inside a DB transaction (`withTransaction` → `paymentService.openReturnRefund`), then sends it after commit (`paymentService.sendOpenedRefund`). Returns `'settled' | 'open' | null`.
- **`TransferOrderOptions`** — Optional overrides for `transferOrder`: buyer, unit price, stock-hold hours.
- **`transferOrder`** — Creates a user, product, and a `bank_transfer` order with a fixed `payBy` deadline, then calls `paymentService.openTransferPayment` (the same entry point the `order.created` listener uses). Returns `{ order, payment, reference }`.
- **`payByCard`** — Opens a payment intent and confirms it with the fake provider's test Visa card. Does **not** settle the outbox.
- **`refundOrderPayment`** — Operator-initiated refund addressed by order ID; looks up the payment then calls `paymentService.refundPayment`. Accepts an optional `{ amount, currency }` body.
- **`providerRefOf`** — Returns the provider-side intent ID for an order's payment (not exposed over the wire). Throws if absent.
- **`storedRefundStamps`** — Reads an order's stored refund array and projects `{ reason, returnId, dueBy, dueRule }` for assertion.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/runtime/database.ts` | Imports `withTransaction` to wrap `refundForReturn`'s open step. |
| `src/domain-primitives/time.ts` | Imports `HOUR_MS` to compute the `payBy` deadline in `transferOrder`. |
| `src/modules/orders/tests/factories.ts` | Imports `createOrder`, `toOrderItem` to build the order fixture. |
| `src/modules/payments/domain/index.ts` | Imports `buildReference` to derive the transfer reference returned by `transferOrder`. |
| `src/modules/payments/domain/transfer-reference.ts` | Source of `buildReference` (re-exported through `domain/index.ts`); used to construct the RF reference string. |
| `src/modules/payments/services/index.ts` | Imports `paymentService` — every card, transfer, and refund call goes through it. |
| `src/modules/payments/repository.ts` | Imports `paymentRepository` to look up persisted payments. |
| `src/modules/payments/services/refunds.ts` | Re-exports `refundForOrder` so external test files have a single import path. |
| `src/modules/payments/tests/contract/api.contract.test.ts` | Consumer; exercises `payByCard`, `refundOrderPayment`, `providerRefOf`, `storedRefundStamps`. |
| `src/modules/invoicing/tests/integration/issue-credit-note.test.ts` / `credit-note-catch-up.test.ts` | Consumers; rely on `refundForOrder` / `refundForReturn` to set up refunded-order fixtures. |
| `src/modules/account/tests/contract/shop.contract.test.ts` | Consumer; uses `transferOrder` / `payByCard` for shop-flow assertions. |

## Notes

- `transferOrder` calls `paymentService.openTransferPayment` directly rather than emitting an `order.created` event. The module docstring frames this as "the helper is the listener, called once" — no event bus is involved in tests.
- `payByCard` intentionally does **not** drain the outbox. Tests that advance the order past the paid state must settle the outbox themselves.
- In `refundOrderPayment`, when no payment row is found the code passes the raw `orderId` string as the payment ID to `paymentService.refundPayment` (via `payment?._id ?? orderId`). The service is expected to reject this; the fallback exists so the call shape stays uniform.
- `storedRefundStamps` returns an empty array (not `null`) when the payment document or its `refunds` array is absent.
