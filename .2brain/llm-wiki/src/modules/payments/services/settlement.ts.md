---
source: src/modules/payments/services/settlement.ts
sha256: 11afe367e3e5858e316a4d532c16934bff3ec5305a78cb483540f49fa0b4976d
generated_at: 2026-11-14T21:09:40.600030+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/settlement.ts

## Purpose

The single reconciliation point for payment success. Both the browser-driven confirm/sync path and the webhook delivery path funnel into `settlePayment` (referenced in the module docblock) so that money is settled exactly once. The file implements the three success-branch outcomes — *paid*, *mismatched*, and *order-lost* — as well as the idempotency gate that prevents two racing callers from settling the same order twice.

## Key elements

- **`Settlement`** (interface) — Result shape returned to callers that must produce an HTTP response. Carries the updated `payment`, an `orderLost` flag (money arrived too late; refund was opened), and a `transitioned` flag distinguishing "I performed the write" from "a racing caller already did."
- **`receiptMismatch`** (function) — Compares the provider-reported `amount`, `currency`, and `paymentId` against the frozen payment. Returns an array of differing field names; an unreported field counts as differing. Amounts are compared in minor units via `toMinorUnits`.
- **`returnMismatchedMoney`** (function) — Post-commit side effect for the mismatch path: cancels the order via `orderService.cancelForPaymentMismatchById`, then calls `performRefund`. Both steps are fire-and-forget (errors are logged; the reservation-expiry sweep or `retryOpenRefunds` finishes them).
- **`settleMismatch`** (function) — Orchestrates the mismatch path: records what actually arrived inside a transaction (conditional write + open refund + outbox event + `markMoneyReceived`), then after commit nudges the outbox, increments metrics, records an audit entry, and triggers the money return.
- **`SettlementOutcome`** (type) — Discriminated union the settlement transaction resolves to: `replay` (no-op, someone else won), `paid` (order moved to paid), or `lost` (order no longer payable; refund record opened).
- **`settleWithin`** (function) — The atomic, database-only transaction step for the success branch: conditional `succeeded` write, `markPaid` (which commits the stock hold), timeline rows, and outbox rows — or, if the order is lost, the `succeeded` write plus an open refund record. Deliberately contains no provider calls or mail because the DB driver may re-run the callback on a transient error.

## Relationships

- **`@domain-primitives/money`** (`money.ts`) — `toMinorUnits` is used in `receiptMismatch` to normalise amount comparisons and eliminate float noise.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` and their type aliases are imported so callers can shape the HTTP answer from a `Settlement` result.
- **`@infrastructure/adapters/logger`** — `logger` is used for error-level diagnostics in the mismatch and refund-failure paths.
- **`@infrastructure/i18n`** — `t` is imported for caller-facing messages in the full file.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` for emitting settlement analytics.
- **`@infrastructure/observability/audit`** — `recordAudit` writes an audit entry on the mismatch path.
- **`@infrastructure/runtime/database`** — `withTransaction` provides the Mongoose session that makes the settlement writes atomic.
- **`@kernel/outbox`** — `enqueueOutboxEvent` (within the transaction) and `nudgeOutbox` (post-commit) drive downstream settlement events.
- **`@kernel/permissions`** — `systemCallerContext` supplies the actor for audit records on the mismatch path.
- **`@modules/orders`** — `orderService` (cancel, `markMoneyReceived`) and `paymentSettled` (announced post-commit in the full file) bridge to the order module.
- **`@modules/orders/friends/payments`** — `markPaid` performs the order's state transition and stock-hold commit inside `settleWithin`.

## Notes

- **Single-writer principle.** The module docblock states the invariant explicitly: there must be one reconciliation point; two would drift and could settle an order twice. Any new settlement path must go through `settlePayment`.
- **Idempotency gate.** The `updateStatusIfIn` conditional write (status must be in `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`, which excludes `succeeded`) is the concurrency guard. A losing racer gets `recorded === false` and returns a `replay` outcome with `transitioned: false`.
- **`settleWithin` is DB-only by design.** No HTTP, provider, or mail calls may be added inside it; the DB driver re-runs the callback on transient errors, so any external side effect would fire twice.
- **Minor-units comparison.** `receiptMismatch` converts both sides through `toMinorUnits` before comparing, so a `10.00` vs `10` float artefact is not flagged as a mismatch. An unreported amount is treated as a mismatch (unverifiable money is rejected).
- **Stryker disable/restore blocks** surround the `catch` handlers that intentionally swallow errors (the refund/cancel sweeps are the backstop). Mutation testing will not kill those branches.
