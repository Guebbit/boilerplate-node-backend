---
source: src/modules/shop-tasks/tests/integration/outcome-unknown.test.ts
sha256: 2ded18c136248f20c603fd60deffca8faeaf925f11256cb36392918992fba7f1
generated_at: 2026-11-14T21:57:03.834953+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/outcome-unknown.test.ts

## Purpose

Integration test (real HTTP via supertest) that verifies the "outcome unknown" path for every do-not-retry write operation: after the first attempt commits but its idempotency record is stuck in-flight (simulating a crash before the done-mark), a retry must return `409 IDEMPOTENCY_OUTCOME_UNKNOWN` without re-executing the write, notify staff exactly once (bell + mail), and all subsequent retries must replay the stored answer. One case is generated per do-not-retry operation, so a new operation lacking a notice mapping will fail here.

## Key elements

- **`CASES: Case[]`** — Table of do-not-retry operations (`refund`, `ship`, `receive-stock`, `adjust-stock`). Each entry supplies an `arrange` function that sets up the subject (order, product, fulfillment order) and returns `send`, `subjectName`, `subjectId`, and an `effect` reader used to assert idempotency.
- **`crashAfterCommit(key)`** — Rewrites the idempotency record directly on the raw MongoDB collection: sets `state` to `'in_flight'`, backdates timestamps by one hour, and unsets response fields, simulating a crash between commit and done-mark.
- **`bellOf(userId)`** — Queries `notificationsService.listVisible` for the recipient and filters to `code === 'shop-tasks.staff.outcome-unknown'`.
- **`noticeMailRecipients()`** — Inspects the mocked `enqueueEmail` call queue, filters to the `notifications.staff-notice` template with the "Check the result" subject prefix, and returns the sorted list of `to` addresses.
- **`recipient()`** — Factory helper creating an admin user with `authenticatorEnabledAt` set (the designated notice recipient).
- **`describe.each(CASES)` / `it(...)`** — The single test body that drives the full sequence: first attempt → wait for `done` → crash → retry (assert 409, no re-run, one notice, mail to all involved) → replay (assert `idempotent-replayed: true`, no duplicate notices).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Mocked at module level; the test asserts on `enqueueEmail` call arguments (template, subject, `to`) to verify staff notification.
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — The test imports `idempotencyRecordModel` to check for the `done` state and to write directly to the underlying collection (bypassing model middleware) in `crashAfterCommit`.
- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID` used when scoping the notification-bell query.
- **`src/kernel/permissions.ts`** — Provides `callerInScope` to build the permissioned caller context for the bell query.
- **`src/modules/notifications/index.ts`** / **`src/modules/notifications/services/index.ts`** — The test imports `notificationsService` from these to read the staff bell.
- **`src/modules/products/index.ts`** / **`src/modules/products/services/index.ts`** — The test imports `productService` from these as the `effect` reader for stock operations.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` set up refund and ship scenarios.
- **`src/modules/delivery/tests/factories.ts`** — `fulfillmentOrdersOf` retrieves the fulfillment order for the ship case.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates the product subject.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates the staff recipient.
- **`src/types/index.ts`** — `OrderStatus` enum used to set order state in the ship case.
- **`tests/support/callers.ts`** — `asRole` builds the role-scoped caller object.
- **`tests/support/eventually.ts`** — `eventually` polls asynchronously for the idempotency record to reach `done` and for mail to be queued.

## Notes

- The mailer mock is at the **queue** level (`enqueueEmail`), not the transport; the test verifies what *would* be sent, not delivery.
- `crashAfterCommit` bypasses the Mongoose model (writes to `.collection`) because the model's middleware would restamp `updatedAt`, defeating the "long ago" simulation.
- The test waits for `state: 'done'` **before** simulating the crash because the idempotency record is persisted after the HTTP response has already left the process.
- The mail assertion expects **exactly two** recipients (the admin sender + the designated recipient) and that all addresses are unique (`new Set(mailed).size === mailed.length`).
- The `receive-stock` and `adjust-stock` cases are generated via `(['receive','adjust'] as const).map(…)`, so adding a new stock verb there is the way to extend coverage.
