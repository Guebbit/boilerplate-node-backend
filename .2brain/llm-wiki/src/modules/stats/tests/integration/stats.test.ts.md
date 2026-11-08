---
source: src/modules/stats/tests/integration/stats.test.ts
sha256: d58b9b1fcb1aaa970e15c45f2c6f31e0d6a457ea25132c2b1bc2ccc3690b6168
generated_at: 2026-11-08T08:26:40.975766+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/integration/stats.test.ts

## Purpose

Integration tests for the stats service (`statsService`), run against a real MongoDB instance. Verifies that sales figures are bucketed by shop-local day (`Europe/Rome`), currencies are never mixed, credit notes land on their own day, period totals are bucket-size invariant, previous-period comparison works, empty periods return zeroed buckets, and product/category breakdowns are correct. Also the only test that passes a real IANA zone name through `$dateTrunc` on the Mongo binary.

## Key elements

- **`setupTestDb()`** (top-level call) — boots a real Mongo for the test run.
- **`beforeEach` / `afterEach`** — registers all five domain modules (`users`, `products`, `inventory`, `orders`, `invoicing`) via `registerModules`; resets domain events after each case.
- **`issuedAt(at, issue)`** — helper that freezes the system clock at `at`, awaits the issue callback (invoice or credit note), then restores real timers. Needed because the *issue date* is stamped by the listener's own clock, not the document field.
- **`customer()`** — returns a uniquely-emailed user (global `sequence` counter) so a test can hand the same customer two orders.
- **`paidOrder(options)`** — creates a paid order (122.00 = 100.00 net + 22.00 VAT) and immediately issues its invoice, both stamped at `paidAt`.
- **`periodOf(from, to, interval?)`** — wraps `resolvePeriod`; throws on refusal so assertions stay clean.
- **`seedScenario()`** — seeds the shared fixture: order A (23:30 Rome / 22:30 UTC), order B (00:30 Rome next day / 23:30 UTC), order C (February, out of period), a full credit note for A on the 12th, a canceled order, and an unpaid bank-transfer order.
- **`describe('getSalesStats')`** — 7 cases covering timezone bucketing, currency isolation, soft-deleted orders, full totals (gross / reversals / net / VAT / refunds / AOV), bucket-size invariance (day = week = month), previous-period read, and empty-period zeros.
- **`describe('the breakdowns')`** — product and category stats (net sales, units, VAT) and per-day unit series (truncated in the listing).

## Relationships

- **`src/kernel/registry.ts`** → `registerModules` wires all domain modules into the app for each test.
- **`src/kernel/events.ts`** → `resetDomainEvents` clears the event bus between cases.
- **`src/modules/orders/tests/factories.ts`** → `createOrder`, `toOrderItem` build the order documents and line items.
- **`src/modules/products/tests/factories.ts`** → `createProduct` seeds catalog items with price and categories.
- **`src/modules/invoicing/index.ts`** → exports `invoicingService` used to issue invoices inside `paidOrder`.
- **`src/modules/invoicing/tests/factories.ts`** → `issueCreditNote` creates the credit-note document under a frozen clock.
- **`src/modules/invoicing/module.ts`**, **`src/modules/orders/module.ts`**, **`src/modules/products/module.ts`**, **`src/modules/inventory/module.ts`**, **`src/modules/users/module.ts`** (via `@modules/users/module`) → registered in `beforeEach` so listeners and repositories are active.
- **`src/modules/stats/services/index.ts`** → exports `statsService`, the system under test.

## Notes

- The module-level doc comment states `NODE_SHOP_TIMEZONE` is `Europe/Rome` for this file; bucket boundaries therefore fall at 23:00 UTC (winter time, +01:00).
- `issuedAt` restores timers in a `finally` block — if the issue callback throws, the clock is still unfrozen.
- The `sequence` counter is module-scoped and never reset; it only guarantees uniqueness, not starting at 1.
- A price of `122.00` is used throughout so that net (100.00) and VAT (22.00) are cleanly separable in assertions.
- The `periodOf` helper throws on a *refused* period rather than returning a sentinel, so a malformed `from`/`to` pair fails the test immediately.
