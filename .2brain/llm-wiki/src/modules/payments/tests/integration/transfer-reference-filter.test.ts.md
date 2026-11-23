---
source: src/modules/payments/tests/integration/transfer-reference-filter.test.ts
generated_at: 2026-11-22T07:03:32.470890+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/transfer-reference-filter.test.ts

## Purpose
Integration test for the staff list's `transferReference` filter (`src/modules/payments/services/list.ts`) and the offline settlement endpoint (`src/modules/payments/services/offline.ts`) it feeds. It checks that a bank-transfer payment's reference finds its own payment regardless of spacing or case, that mistyped or unmatched input finds nothing, and that the order the filter names is the same one the existing offline endpoint settles, with no new settlement code in between.

## Key elements
- `orderIdsFor(transferReference)`: helper that calls `paymentService.listPayments({ transferReference }, asAdmin())` and returns the `orderId` of each row as a string, because rows hold the stored ObjectId until serialized.
- `describe('the transferReference filter')`, with these cases:
  - The payment's own RF reference finds its order.
  - A reference split into 4-character groups and lowercased still finds the order.
  - A raw ObjectId finds nothing.
  - A reference with its last character changed finds nothing, rather than matching the wrong order.
  - A well-formed reference built with `buildReference` for a fresh ObjectId, never minted for a payment, finds nothing. This is the miss branch, distinct from the checksum rejection.
  - Input that is not a reference (`'not-a-reference'`) returns an empty page with `items: []` and meta containing `totalItems: 0` and `totalPages: 0`.
- `describe("filter then settle — the admin's two-step flow")`: takes the order id from the filter, calls `paymentService.recordOfflinePayment` with a `bank_transfer` method under an admin caller context, and expects `success` to be true and the stored order's status to be `'paid'`.

## Relationships
- `setupTestDb` (`src/../tests/support/setup-test-db.ts`, i.e. `tests/support/setup-test-db.ts`): called at module level to set up the test database.
- `asAdmin` and `callerContextAs` (`tests/support/callers.ts`): supply the caller context for listing and for offline recording.
- `transferOrder` (`src/modules/payments/tests/factories.ts`): creates an order with a bank-transfer payment and returns `{ order, reference }`.
- `readOrder` (`src/modules/orders/tests/factories.ts`): reads the order back to confirm its status after settlement.
- `paymentService` (`src/modules/payments/services/index.ts`): exposes `listPayments` and `recordOfflinePayment`, the code under test.
- `buildReference` (`src/modules/payments/domain/index.ts`, from `src/modules/payments/domain/transfer-reference.ts`): generates a valid reference for an order id that has no payment.

## Notes
- Imports use the `@tests/` and `@modules/` aliases for shared helpers and other modules, and relative paths for the payments domain and factories.
- The typo test swaps the last character of the reference for `'0'`, or for `'1'` if it already ends in `'0'`, so the changed reference always differs from the original.
