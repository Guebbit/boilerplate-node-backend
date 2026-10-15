---
source: src/modules/stats/tests/integration/stats.test.ts
sha256: f4d4f05dfaec292d7b28f59a4b214d81e2c3350856279f6f66c08745b6b933a5
generated_at: 2026-10-15T12:05:17.076210+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/integration/stats.test.ts

## Purpose

Integration test suite that exercises the stats service (`statsService`) against a real MongoDB instance, verifying that every composed figure (gross, net, VAT, refunds, per-day buckets, customer counts, cancellation/refund rates, pipeline snapshot) agrees with the underlying order, invoice, and credit-note documents. It is specifically the test that passes a real IANA zone name (`Europe/Rome`) through Mongo's `$dateTrunc`, making it the guard for shop-local-day bucketing.

## Key elements

- **`seedScenario`** – Seeds the canonical fixture: two paid orders (A at 22:30 UTC, B at 23:30 UTC on 10 Mar), a February order for the same "regular" customer, a full credit note for A issued on 12 Mar, a cancelled order, and an unpaid bank-transfer order. Returns the product and two customers for reuse in individual tests.
- **`issuedAt(at, issue)`** – Freezes the system clock to `at`, invokes the issue callback (invoice / credit-note), then restores real timers. Necessary because the issue-date listener stamps its own `Date.now()`.
- **`paidOrder(options)`** – Convenience: creates a paid order via the orders factory, then issues its invoice under a frozen clock so both documents share the same date.
- **`periodOf(from, to, interval)`** – Wraps `resolvePeriod` and throws on refusal, returning a ready-to-use `Period`.
- **`customer()` / `sequence`** – Generates a user with a globally unique email (`shopperN@example.com`) so the "new vs returning" logic is unambiguous.
- **`describe('getSalesStats')`** – Five cases covering: shop-local-day bucket boundaries; period totals with reversals landing on their own day; bucket-size invariance (day = week = month totals); `previous`-period carry; and empty-period zero-filling.
- **`describe('the breakdowns')`** – Covers `getProductStats`, `getCategoryStats`, `getProductSeries`, `getCustomerStats` (including erased-account exclusion via `detachOrderUserId`), `getOperationsStats` (cancellation, refund, return rates), and `getPipelineStats` (awaiting transfers, unshipped paid orders).

## Relationships

- **`src/modules/stats/services/index.ts`** — the SUT; all assertions call methods on the exported `statsService`.
- **`src/modules/stats/services/range.ts`** — `resolvePeriod` and `Period` type are imported to build query periods from date strings.
- **`src/kernel/registry.ts`** — `registerModules` is called in `beforeEach` to mount the module graph the service expects.
- **`src/kernel/events.ts`** — `resetDomainEvents` runs in `afterEach` to clear the in-memory event bus between tests.
- **`src/modules/invoicing/index.ts`** — re-exported `issueInvoice` and `issueCreditNote` are the side-effecting calls that create the documents stats reads.
- **`src/modules/invoicing/services/issue-invoice.ts` / `issue-credit-note.ts`** — the actual services invoked inside `issuedAt`; their domain events are what the stats listeners consume.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `detachOrderUserId` build and mutate order documents for the fixture.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the single product used across all cases.
- **`src/modules/inventory/module.ts`, `src/modules/products/module.ts`, `src/modules/orders/module.ts`, `src/modules/invoicing/module.ts`** — registered so cross-module listeners (e.g. invoice creation on order) fire correctly.
- **`src/modules/orders/index.ts` / `model.ts`** — `OrderDocument` type is imported for the return type of `paidOrder`.

## Notes

- **Timezone is hard-coded by environment.** `NODE_SHOP_TIMEZONE` is expected to be `Europe/Rome`; all bucket-start values in assertions are UTC offsets of that zone (winter +01:00, so shop midnight = 23:00:00Z). Changing the env var without updating expectations will break every bucket assertion.
- **Clock freezing is per-call, not per-test.** `issuedAt` calls `jest.useRealTimers()` in its `finally` block. If a test issues two documents, it must call `issuedAt` twice—there is no multi-freeze helper.
- **Reversals are dated by the credit-note issue date, not the original order date.** The test explicitly asserts the reversal bucket (`2026-03-11T23:00:00.000Z`) differs from the sale bucket. Any refactoring that re-dates reversals to the original order will fail this test.
- **Erased-account test relies on the placeholder email** (`anonymized@deleted.invalid`) combined with `detachOrderUserId`. The stats service must group by *user ID* (not email) to exclude these correctly; the test guards against an email-based fallback.
- **Bucket-size invariance** is a contract: day, week, and month totals must be identical for the same date range. The week-bucket start assertion also pins the Monday-start convention (`2026-02-22T23:00:00.000Z` for the week containing 1 Mar).
