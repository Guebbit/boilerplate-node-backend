---
source: src/modules/stats/tests/integration/stats.test.ts
sha256: 88d400c619682378c9d29a7fa9b6f0424116a46680ffb68d6f1f69a275b711f6
generated_at: 2026-10-29T05:57:06.381551+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/integration/stats.test.ts

## Purpose

Integration test suite for the stats service (`statsService`) that exercises sales aggregation, product/category breakdowns, and per-product time series against a real MongoDB instance. It focuses on edge cases at the boundaries: shop-local timezone bucketing (`Europe/Rome`), currency separation, deleted-but-invoiced orders, credit-note reversals on their own day, bucket-size invariance, and previous-period comparison. It is the only test that passes a real IANA zone name through `$dateTrunc` on the Mongo binary.

## Key elements

- **`seedScenario()`** — Seeds a multi-customer, multi-order scenario (orders A, B, C, a credit note for A, a cancelled order F, and an unpaid bank-transfer order E) used by most tests.
- **`paidOrder()`** — Creates a paid order *and* its invoice, both dated to a given `paidAt` instant, with a 122-unit price (100 net + 22 VAT).
- **`issuedAt(at, issue)`** — Freezes the clock via `freezeDate`, runs `issue()`, then restores real timers. Ensures the document's issue date matches the frozen instant.
- **`periodOf(from, to, interval)`** — Thin wrapper around `resolvePeriod` that throws on refusal; returns a `Period` for `day`, `week`, or `month` buckets.
- **`customer()`** — Returns a unique `createUser` call (incrementing `sequence` for email uniqueness).
- **`describe('getSalesStats')`** — Tests timezone-aware daily bucketing, per-currency isolation, deleted-order handling, full-period totals (gross, reversals, net, VAT, refunds, AOV), bucket-size invariance (day = week = month totals), previous-period carry, and empty-period zero-fill.
- **`describe('the breakdowns')`** — Tests `getProductStats`, `getCategoryStats`, and `getProductSeries` (per-product daily units).

## Relationships

- **`src/modules/stats/services/index.ts`** — Exports `statsService`, the primary subject under test (`getSalesStats`, `getProductStats`, `getCategoryStats`, `getProductSeries`).
- **`src/modules/stats/services/index.ts`** (re-exports) — Also imports `resolvePeriod` and `Period` type from `../../services/range`.
- **`src/kernel/registry.ts`** — `registerModules` called in `beforeEach` to wire all domain modules.
- **`src/kernel/events.ts`** — `resetDomainEvents` called in `afterEach` to clear the event bus between tests.
- **`src/modules/invoicing/index.ts`** — Provides `invoicingService` used to issue invoices in helpers.
- **`src/modules/invoicing/module.ts`**, **`src/modules/orders/module.ts`**, **`src/modules/products/module.ts`**, **`src/modules/inventory/module.ts`** — Registered so domain events and listeners fire during order creation and invoicing.
- **`src/modules/invoicing/tests/factories.ts`** — Supplies `issueCreditNote` for the reversal scenario.
- **`src/modules/orders/tests/factories.ts`** — Supplies `createOrder`, `toOrderItem`, `detachOrderUserId`.
- **`src/modules/products/tests/factories.ts`** — Supplies `createProduct`.
- **`src/modules/orders/index.ts`** — Source of the `OrderDocument` type used in helper signatures.

## Notes

- The test assumes `NODE_SHOP_TIMEZONE=Europe/Rome`; bucket boundaries in assertions are written as `T23:00:00.000Z` (winter offset +01:00). Do not copy these timestamps into a summer-timezone context without adjusting.
- `issuedAt` relies on `jest.useRealTimers()` in its `finally` block; if the inner promise rejects, the timer is still restored, but the caller will see the rejection.
- The `sequence` counter is module-scoped and never reset; it only guarantees uniqueness *within a single test run*, not across workers.
- The "deleted order" test depends on the invariant that a soft-deleted (`deletedAt`) order's invoice is *not* reversed, so its money stays in `netSales` while the order count drops. This is an accounting rule, not a bug.
- Week buckets start on Monday in the shop timezone; the first week of March 2026 begins on 2026-02-23 (local), which is why the assertion uses `2026-02-22T23:00:00.000Z`.
