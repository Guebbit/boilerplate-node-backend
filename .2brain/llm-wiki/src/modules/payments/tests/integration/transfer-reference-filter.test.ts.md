---
source: src/modules/payments/tests/integration/transfer-reference-filter.test.ts
sha256: fa90a7eefce68ea950e2eac1f1ee039b8e05eb03ee510c046626b5e3fbad50f3
generated_at: 2026-10-29T05:22:48.667062+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/transfer-reference-filter.test.ts

## Purpose

Integration tests that pin the `transferReference` filter in `paymentService.listPayments`: a bank-transfer reference must find its own payment regardless of spacing or case, a mistyped or never-minted reference must find nothing, and the order the filter returns is the same order the existing `recordOfflinePayment` endpoint settles — with no intermediate settlement code.

## Key elements

- **`orderIdsFor(transferReference)`** — local helper that calls `paymentService.listPayments({ transferReference }, asAdmin())` and returns the `items`' `orderId` values as strings (MongoDB ObjectIds are not yet serialized at this layer).
- **`describe('the transferReference filter', …)`** — six cases: exact match, spaced/lowercase match, raw ObjectId rejected, one-character typo rejected, well-formed orphan reference (built via `buildReference`) rejected, and non-reference input returning `{ items: [], meta: { totalItems:0, totalPages:0 } }`.
- **`describe('filter then settle — the admin's two-step flow', …)`** — one case: filter by reference → get order ID → call `recordOfflinePayment` → assert `success` and that the stored order is now `'paid'`.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to prepare the in-memory MongoDB.
- **`tests/support/callers.ts`** — provides `asAdmin()` and `callerContextAs('admin')` for the authentication context passed to service calls.
- **`src/modules/payments/services/index.ts`** — the SUT: `paymentService.listPayments` (filter) and `paymentService.recordOfflinePayment` (settle).
- **`src/modules/payments/domain/index.ts`** → **`transfer-reference.ts`** — `buildReference` is used to mint a structurally valid but unassigned reference for the orphan case.
- **`src/modules/payments/tests/factories.ts`** — `transferOrder()` creates the payment + order fixture used by every test.
- **`src/modules/orders/tests/factories.ts`** — `readOrder` reads back the persisted order to verify the `'paid'` status transition.

## Notes

- Order IDs are compared as **strings** (`String(row.orderId)`) because the service returns raw `ObjectId` instances, not yet-serialized hex strings.
- The orphan-reference test is deliberately distinct from the checksum-rejection path: `buildReference` produces a valid checksum, so the miss is a *no-match* rather than a *format rejection*.
- The typo test flips the last hex digit (`0`↔`1`) to guarantee the reference is still well-formed but simply wrong.
