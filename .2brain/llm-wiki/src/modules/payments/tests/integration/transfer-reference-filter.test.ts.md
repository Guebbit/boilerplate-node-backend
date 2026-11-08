---
source: src/modules/payments/tests/integration/transfer-reference-filter.test.ts
sha256: fa90a7eefce68ea950e2eac1f1ee039b8e05eb03ee510c046626b5e3fbad50f3
generated_at: 2026-11-08T07:38:51.433251+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/transfer-reference-filter.test.ts

## Purpose

Integration test that pins the `transferReference` filter on the staff payment list and its downstream effect: a valid reference finds exactly its own payment (regardless of spacing/case), invalid or unmatched inputs find nothing, and the order the filter names is the one the existing offline-settle endpoint then marks paid.

## Key elements

- **`orderIdsFor(transferReference: string)`** — module-level helper that calls `paymentService.listPayments({ transferReference }, asAdmin())` and maps the resulting rows to their stringified `orderId`s. All "finds" / "finds nothing" assertions go through this.
- **`describe('the transferReference filter')`** — six cases covering: exact match, grouped/lowercase input, raw ObjectId rejection, one-character typo rejection, well-formed-but-unminted reference (built via `buildReference`), and non-reference garbage returning an empty page with zeroed meta.
- **`describe("filter then settle — the admin's two-step flow")`** — single case that takes the `orderId` from a successful filter query, calls `paymentService.recordOfflinePayment`, and asserts the order's persisted status becomes `'paid'`.

## Relationships

- **`src/modules/payments/services/index.ts`** — imports `paymentService`; the `listPayments` and `recordOfflinePayment` calls under test.
- **`src/modules/payments/tests/factories.ts`** — imports `transferOrder`, which seeds a paid bank-transfer order and returns its `reference`.
- **`src/modules/payments/domain/index.ts`** — imports `buildReference` to mint a checksum-valid reference for the "orphan" case.
- **`src/modules/orders/tests/factories.ts`** — imports `readOrder` to verify the settled status after the two-step flow.
- **`tests/support/callers.ts`** — imports `asAdmin` (filter queries) and `callerContextAs('admin')` (settle call).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope; the suite runs against a real database, not mocks.

## Notes

- The "orphan" test (`buildReference(new Types.ObjectId().toHexString())`) is deliberately distinct from the typo test: it proves a *checksum-valid* reference that was never associated with a payment still returns an empty result, not a checksum-rejection error.
- `orderIdsFor` compares ObjectIds as strings because list rows expose the raw `ObjectId` until serialization; direct `expect(...).toEqual([order._id])` would fail on type.
- The settle step uses `callerContextAs('admin')` rather than `asAdmin()`, matching the offline endpoint's expected caller shape.
