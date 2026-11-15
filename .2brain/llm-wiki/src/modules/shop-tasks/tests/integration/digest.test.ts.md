---
source: src/modules/shop-tasks/tests/integration/digest.test.ts
sha256: 3267ba1f88351daefd5f04ce0f361d64874399001f13c57522aa0a4ce61624b3
generated_at: 2026-11-14T21:56:01.708439+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/digest.test.ts

## Purpose

Integration test for the staff daily digest job (`runStaffDigest`). It exercises the full pipeline — real modules registered, real orders/returns/shipments in the test database, real notification bell — while stubbing only the mailer. Proves who receives which summary row, that a re-run neither duplicates the bell row nor re-mails, that a zero count removes the row, and that only overdue (mailed) summaries enqueue an email.

## Key elements

- **`staff(role, email, locale?)`** — helper that creates a user with the given role and an armed authenticator app.
- **`summariesOf(role, userId)`** — reads the tenant-scoped notification bell and returns sorted `[code, count]` pairs.
- **`unshippedWorkOf(role, userId)`** — extracts the `params.work` deep-link from the unshipped bell row.
- **`digestMails()`** — filters the mocked `enqueueEmail` call queue for the `shop-tasks.staff-digest` template.
- **`paidAndWaiting(days, extras?)`** — creates a buyer, product, and paid order backdated by `days`; optional `deletedAt` for soft-delete cases.
- **`describe('the daily digest', …)`** — the main suite with cases covering: unshipped summary isolation, deleted-order exclusion, mail idempotency + locale + work-link, count growth (row rewrite, two mails), count decrease (no new mail, row stays read), stale-refunds vs. low-stock split (mail vs. bell-only), zero-count row removal, bell-only summary (transfers-due), undelivered parcels, awaiting-tracking, and undecided/withdrawal returns.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is fully mocked at the module level; all mail assertions go through the mock call queue.
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` is called in `beforeEach` so the digest sees the same module graph as production.
- **`src/modules.ts`** — source of the `enabledModules` array passed to the registry.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in setup/teardown prevents cross-test event bleed.
- **`src/kernel/permissions.ts`** — `callerInScope` wraps the role/user for tenant-scoped notification reads.
- **`src/kernel/access/tenant.ts`** — supplies `DEPLOYMENT_TENANT_ID` for those scoped calls.
- **`src/domain-primitives/time.ts`** — `DAY_MS` is the unit for backdating paid orders and shipments.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `markOrderPaidAt`, `toOrderItem`, `forceOrderStatus` build and mutate order fixtures.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo`, `shipEverything`, `backdateShipments` advance fulfillment state.
- **`src/modules/notifications/index.ts`** — exports `notificationsService`; the test uses it to read the bell (`listVisible`) and to mark rows as read (`readAll`) in assertions.
- **`src/modules/inventory/index.ts`** — exports `inventoryService`; the stale-refunds test calls `listLevels({ lowOnly: true })` to confirm low-stock data exists before running the digest.
- **`src/modules/payments/index.ts`** — exports `paymentService`; the stale-refunds test spys on `listAttention` to return a synthetic stale-refund item.

## Notes

- Only the mailer is stubbed at the module level; the notifications service, inventory service, and payments service run against the real test database. The single `jest.spyOn(paymentService, 'listAttention')` in the stale-refunds case is the sole service-level override.
- `afterEach` calls `jest.restoreAllMocks()` specifically to undo that spy; forgetting it would leak the stub into subsequent tests.
- The test imports `enabledModules` from `src/modules.ts`. If a new module is added there, it is automatically registered for these tests — but if that module has side effects in its constructor or event handlers, this suite will surface them.
- The `work` deep-link assertion (`sales/orders?fulfillmentStatus=awaiting_shipment&deleted=false`) is checked both on the bell row and inside the mailed template's `lines[].link`, ensuring the two stay in sync.
