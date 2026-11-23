---
source: src/modules/stats/tests/integration/stats.test.ts
source_sha256: b31a6b40ea5b187326525850f3f44e8ccc28f35d95454450c4550363b238845b
context_sha256: 6b1068d658fc002b80c1b444f8321ae3a0b178093ce1b0661933389fd982703b
generated_at: 2026-11-22T07:52:42.518658+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/tests/integration/stats.test.ts

## Purpose
Integration test for the stats module's service layer, run against a real test database. It seeds paid orders, invoices and a credit note under a frozen clock, then reads them back through `statsService`. It focuses on edge cases: shop-local day boundaries (`NODE_SHOP_TIMEZONE` is `Europe/Rome`, so this is also the one test that passes a real zone name through `$dateTrunc` on the Mongo binary), refunds landing on their own day, customers counted as new once, and composed figures agreeing with the underlying documents.

## Key elements
- `setupTestDb()` plus a `beforeEach` that calls `registerModules` with the users, products, inventory, orders and invoicing modules. An `afterEach` calls `resetDomainEvents()`.
- `issuedAt(at, issue)`: freezes the clock at `at` with `freezeDate`, runs `issue`, then restores real timers. It exists because the issue date comes from the listener's own clock.
- `customer()`: creates a user with a unique email from a module-level `sequence` counter.
- `paidOrder({ user, product, quantity, paidAt, currency? })`: creates a paid order (`paidAt` and `createdAt` both set to `paidAt`) and issues its invoice via `invoicingService.issueInvoice` under a frozen clock. A 122.00 unit is 100.00 net plus 22.00 VAT.
- `periodOf(from, to, interval = 'day')`: wraps `resolvePeriod` and throws if the period is refused.
- `seedScenario()`: builds the shared fixture and returns `{ product, firstCustomer, regular }`:
  - A: first-time customer, paid 22:30 UTC on 10 March, which is 23:30 in Rome.
  - B: a returning customer, 2 units, paid 23:30 UTC on 10 March, which is 00:30 in Rome on the 11th.
  - C: B's customer, paid in February, outside the period.
  - A full credit note for A issued on 12 March.
  - F: a canceled order in the period.
  - E: an unpaid bank-transfer order.
- `describe('getSalesStats')` cases:
  - Day bucketing by shop day: buckets start at shop-local midnight, e.g. `2026-03-09T23:00:00.000Z`.
  - Currencies kept in separate groups (EUR and USD are never summed).
  - A soft-deleted order's invoice money stays in net sales while its order count drops.
  - Period totals: gross, reversals, net, VAT, refunds, average order value.
  - Totals are identical across day, week and month intervals. Weeks start on Monday.
  - `previous` carries the equal-length period before.
  - An empty period returns zeros in the shop currency with all buckets present.
- `describe('the breakdowns')` covers `getProductStats` and `getCategoryStats`, ranked by net sales excluding VAT. A per-product units-per-day case follows; the rest of the file is not visible here.

## Relationships
- `@kernel/registry` (`registerModules`) and `@kernel/events` (`resetDomainEvents`) wire up and reset the module graph and event listeners around each test.
- The products, inventory, orders and invoicing `module.ts` files are registered so the invoice listeners work. The invoicing listener issues invoices when orders are paid.
- `@modules/invoicing` (its `index.ts`, which the file imports `invoicingService` from) is used to issue invoices; `@modules/invoicing/tests/factories` provides `issueCreditNote`.
- The products and orders test factories supply `createProduct`, `createOrder`, `toOrderItem` and `detachOrderUserId`. `OrderDocument` is imported from `@modules/orders`.
- `../../services` (`src/modules/stats/services/index.ts`) provides `statsService`, the subject under test. `../../services/range` provides `resolvePeriod` and `Period`.

## Notes
- Expected bucket starts are UTC instants of Rome midnight and assume winter time (+01:00) in March.
- Each test seeds its own data. The `sequence` counter is module-level, so emails stay unique across tests in the file.
- Net sales deliberately keeps a deleted order's invoice, which is right for accounting, while order counts and product tables lose it.
