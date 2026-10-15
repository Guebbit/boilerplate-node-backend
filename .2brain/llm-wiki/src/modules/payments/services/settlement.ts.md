---
source: src/modules/payments/services/settlement.ts
sha256: c17b52af3751d3719abd328e0485a6a12f2211dd752cd61b99e5d31c753768f8
generated_at: 2026-10-15T11:32:12.771690+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/settlement.ts

## Purpose

The single reconciliation point for payment settlement. All entry paths—browser-driven confirm/sync and provider webhook delivery—funnel into `settlePayment` so that money is reconciled in exactly one place. This prevents two divergent code paths from committing inventory twice.

## Key elements

- **`Settlement`** (interface) — the result shape returned to callers: the updated `PaymentDocument`, an `orderLost` flag (money arrived but order can no longer be paid), and a `transitioned` flag (did *this* call perform the write, or did a racing call win?).
- **`receiptMismatch`** — compares the provider's `succeeded` report (amount, currency, paymentId) against the frozen payment. Returns the list of disagreeing fields; uses `toMinorUnits` so float noise is not a false mismatch.
- **`refundLostPayment`** — puts the money back when the order is no longer payable. Writes a durable `markRefundOwed` marker *before* attempting the refund; logs and swallows failures, leaving the `ORDER_REFUND_OWED` retry sweep to finish.
- **`cancelMismatchedOrder`** — cancels the order after a provider mismatch; falls back to `refundLostPayment` if the cancel is refused; logs and swallows throws, relying on reservation expiry as the final safety net.
- **`settleMismatch`** — records the *arrived* figures (not the frozen ones) so the refund returns what was actually collected, cancels the order, increments a mismatch metric, records an audit entry, and returns a `Settlement` with `orderLost: true`.
- **`SettlementOutcome`** (type) — the in-transaction decision: `replay` (already settled), `paid`, or `lost`.
- **`settleWithin`** — the one atomic step inside a DB transaction: conditional `succeeded` write (gated on `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`), order `paid` transition + stock-hold commit, timeline and outbox rows. Database-only; no provider calls or mail so a driver re-run on transient error is safe.
- **`systemContext`** — builds a `CallerContext` under `SYSTEM_ACTOR` for non-request settlement paths (analytics consent off).
- **`settlePayment`** *(below truncation)* — the public entry point referenced in the module doc; orchestrates the success/mismatch branches.

## Relationships

- **`@kernel/permissions`** — uses `SYSTEM_ACTOR` and `callerForSubject` to act under a system identity when no HTTP request is behind the settlement.
- **`@kernel/outbox`** — enqueues outbox events (`enqueueOutboxEvent`, `nudgeOutbox`) after the settlement transaction commits so downstream consumers (invoicing, notifications) fire exactly once.
- **`@infrastructure/runtime/database`** — wraps the settlement step in `withTransaction` to make the payment write, order move, and stock commit atomic.
- **`@modules/orders`** (config / lifecycle) — calls `orderService.markPaid`, `orderService.cancelById`, `orderService.markRefundOwed` / `clearRefundOwed`; reads `isPayable`, `paymentSettled`, `bankTransferHoldHours`.
- **`@modules/inventory`** — imports `inventoryService` to commit the stock hold as part of the paid transition.
- **`@infrastructure/observability/audit`** — calls `recordAudit` for mismatch and settlement events.
- **`@infrastructure/observability/analytics`** — emits analytics events via `emitAnalyticsEvent` / `buildAnalyticsBase`.
- **`@infrastructure/http/response`** — uses `generateSuccess` / `generateReject` to shape the HTTP reply from a `Settlement`.
- **`@infrastructure/i18n`** — imports `t` for user-facing error messages.
- **`@infrastructure/adapters/logger`** — structured error logging in mismatch, refund-failure, and cancel-failure paths.

## Notes

- **Race safety:** the `updateStatusIfIn` gate (status must be in `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`, which excludes `succeeded`) is the idempotency lock. A webhook retry or a duplicate confirm sees `null` and reports `replay` / `transitioned: false` without side-effects.
- **Marker-before-action:** `refundLostPayment` writes `markRefundOwed` *before* calling `performRefund`. Nothing retries this call itself, so a throw with no durable note would lose the refund.
- **Mismatch writes the *arrived* amount:** `settleMismatch` overwrites the frozen figures with what the provider actually collected, so the subsequent refund returns the real amount, not the expected one.
- **`settleWithin` is DB-only by contract:** the module doc explicitly forbids provider calls or mail inside the transaction callback because the driver re-runs it on transient errors.
- **Stryker annotations:** `// Stryker disable all` / `restore all` wrap the error-logging `catch` blocks so mutation testing does not flag them.
- **`transitioned` is caller-facing:** a `false` value means "a racing call already did the work; respond that the payment is settled but take no further action." The `orderLost` flag is the one signal the payment status alone cannot convey to the client.
