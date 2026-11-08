---
source: src/modules/shop-tasks/tests/integration/digest.test.ts
sha256: c2948001a3df516df27958165a809ade5d7de43e85406fbd8c1300b342b99520
generated_at: 2026-11-08T08:18:16.748643+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/digest.test.ts

## Purpose

Integration test for the staff digest job (`runStaffDigest`). Exercises the full pipeline—real module registration, real orders/returns/shipments in the test database, and the notification bell plus mail queue at the output end—to verify correct audience targeting, idempotent re-runs, zero-count row clearing, locale-aware mailing, and the split between daily and weekly digests.

## Key elements

- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a spy so tests assert on queued mail rather than network I/O.
- **`beforeEach` / `afterEach`** — resets the mail mock, clears domain events, and re-registers `enabledModules` for every test.
- **`staff(role, email, locale)`** — creates a user with the given role, an authenticator app armed, and a locale (defaults to `'en'`).
- **`paidAndWaiting(days)`** — creates a buyer, product, and paid order whose `paidAt` is backdated by `days * DAY_MS`, simulating an unshipped order.
- **`summariesOf(role, userId)`** — reads the user's notification bell via `notificationsService.listVisible` and returns sorted `[code, count]` pairs.
- **`unshippedWorkOf(role, userId)`** — extracts the `work` link path from the unshipped notification row.
- **`digestMails()`** — filters `mockEnqueueEmail` calls to only the `'shop-tasks.staff-digest'` template.
- **`describe('the daily digest')`** — seven cases: audience targeting, single mail + locale + idempotency, count growth without duplicate rows, zero-count row removal, bell-only summaries (no mail), undelivered parcels, awaiting-tracking parcels, and undecided/approved returns.
- **`describe('the weekly digest')`** — one case: asserts the weekly run clears a daily row (`cleared: 1`) and writes nothing new.

## Relationships

- **`src/modules/shop-tasks/services/digest.ts`** — imports `runStaffDigest`, the function under test.
- **`src/modules/notifications/index.ts`** — imports `notificationsService` to read bell rows and assert written/cleared state.
- **`src/infrastructure/adapters/mailer.ts`** — mocked; tests assert on `enqueueEmail` call arguments.
- **`src/kernel/registry.ts`** — `registerModules` is called in `beforeEach` to load real modules into the test container.
- **`src/modules.ts`** — provides the `enabledModules` list passed to the registry.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes every `callerInScope` call.
- **`src/kernel/permissions.ts`** — `callerInScope` builds the authenticated caller object for service calls.
- **`src/kernel/events.ts`** — `resetDomainEvents` isolates event state between tests.
- **`src/domain-primitives/time.ts`** — `DAY_MS` constant for backdating order timestamps.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `markOrderPaidAt`, `toOrderItem`, `forceOrderStatus`.
- **`src/modules/delivery/tests/factories.ts`** — `backdateShipments`, `carryOrderTo`, `shipEverything` for parcel-state manipulation.
- **`src/modules/returns/tests/factories.ts`** — `insertBareReturns` to seed return/withdrawal rows.
- **`src/modules/products/tests/factories.ts`** — `createProduct` for order line items.
- **`src/modules/users/tests/factories.ts`** — `createUser` for both staff and buyer fixtures.

## Notes

- The test is a **true integration test**: only the mailer is mocked; the notifications service, registry, and database are all real. This means failures can surface in any of those layers, not just the digest logic.
- Every `staff()` user has `authenticatorEnabledAt` set, implying the digest or notification path rejects users without an armed authenticator.
- The weekly-digest test asserts the exact return shape `{ written: 0, cleared: 1, mailed: 0 }` of `runStaffDigest('weekly')`—the only test that checks the return value rather than side-effects.
- Uses `Array.prototype.toSorted()` (ES 2023), so the project targets a modern runtime.
