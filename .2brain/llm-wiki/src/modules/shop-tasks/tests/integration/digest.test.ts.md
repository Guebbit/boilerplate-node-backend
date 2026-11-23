---
source: src/modules/shop-tasks/tests/integration/digest.test.ts
source_sha256: f2b4407547e0f03e6bb3455a328eec340382c44cfeba41337f131ab62e59f138
context_sha256: b35e859e3873947e591ef8781d2f3af5efe5c77c9f564a530712a82cf76ad391
generated_at: 2026-11-22T07:44:35.674839+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/integration/digest.test.ts

## Purpose
Integration test for the staff digest (`runStaffDigest('daily')`), run the way the scheduled job runs it: real modules registered, real orders, returns and shipments in the test DB, with the notifications "bell" and the mail queue as the outputs. It checks who receives which summary, that re-runs don't duplicate rows or mail, that a count of zero removes the row, and that only the overdue summaries are mailed.

## Key elements
- **`jest.mock('@infrastructure/adapters/mailer')`**: replaces `enqueueEmail` with a mock, so tests assert on the queue rather than rendered mail.
- **`mockEnqueueEmail`**: typed handle on the mock. It is reset in `beforeEach` and defaults to resolving `undefined`.
- **`beforeEach` / `afterEach`**: call `resetDomainEvents()` and `registerModules(enabledModules)`. After each test, `jest.restoreAllMocks()` undoes spies such as the `listAttention` stub.
- **`staff(role, email, locale)`**: creates a user with the given role and an authenticator app enabled.
- **`summariesOf(role, userId)`**: reads the user's bell in tenant scope and returns sorted `[code, count]` pairs.
- **`unshippedWorkOf`**: returns the `work` path on the `shop-tasks.staff.unshipped` row.
- **`digestMails()`**: filters `enqueueEmail` calls to the `shop-tasks.staff-digest` template.
- **`paidAndWaiting(days, extras)`**: creates a paid order, optionally soft-deleted, and backdates its paid time by `days`. It uses a module-level `buyers` counter to keep buyer emails unique.
- **`describe('the daily digest')`** cases visible here:
  - The unshipped summary goes only to the warehouse role, not to support.
  - Deleted orders are not counted.
  - The overdue summary is mailed once, in the reader's locale, and not again on a second run. The mail link matches the bell's `work` path (`sales/orders?fulfillmentStatus=awaiting_shipment&deleted=false`).
  - A count that grew is mailed again and updates the single row.
  - A count that fell updates the row without a new mail, and the row stays read.
  - Stale-refunds is mailed while low-stock stays bell-only.
  - A count falling to zero removes the row.
  - Transfers-due is bell-only.
  - Shipped-but-never-delivered parcels are counted after the allowance (`backdateShipments(20)`).
  - Tracked parcels still missing a code are counted (`awaiting-tracking`).
  - Return requests and overdue withdrawals are counted, seeded with `insertBareReturns`.

## Relationships
- **`@infrastructure/adapters/mailer`** (`src/infrastructure/adapters/mailer.ts`): mocked. Its `enqueueEmail` calls are the mail assertions.
- **`@kernel/registry`, `src/modules.ts`**: `registerModules(enabledModules)` wires up the real module set before each test.
- **`@kernel/events`**: `resetDomainEvents` clears event subscriptions between tests.
- **`@kernel/permissions`, `@kernel/access/tenant`**: `callerInScope` and `DEPLOYMENT_TENANT_ID` build the tenant-scoped caller used to read the bell.
- **`src/modules/notifications/index.ts`, `src/modules/notifications/services/index.ts`**: the `notificationsService` it exports is used to list and mark-read the bell rows the digest writes.
- **`src/modules/inventory/index.ts`, `src/modules/inventory/services/index.ts`**: the `inventoryService` it exports is used in the low-stock precondition check.
- **`src/modules/payments/index.ts`, `src/modules/payments/services/index.ts`**: the `paymentService` it exports is spied on to return a stale-refund item.
- **`src/modules/orders/tests/factories.ts`, `src/modules/delivery/tests/factories.ts`**: build orders and shipments, force statuses, and backdate shipments. Returns and users/products use their own module factories.
- **`src/domain-primitives/time.ts`**: `DAY_MS` is used to backdate paid times.
- **`../../services/digest`**: `runStaffDigest` is the code under test.

## Notes
- The mail queue is mocked, but the notifications, orders and delivery paths run against the real test DB (`setupTestDb()`).
- Role names (`warehouse`, `support`, `admin`, `moderator`) decide which summaries each user receives.
- The file continues beyond the portion visible here, so the full list of cases is not covered by this page.
