---
source: src/modules/shop-tasks/tests/integration/outcome-unknown.test.ts
source_sha256: 8cf7bec14c2d75e0cf01aaa61ab3c952db426688c51921aa53dbdc4563b297bd
context_sha256: ada7676ce56696ff3cd410fb0a73b67069e55eaf78e1f88ec3a92d08bec8e2c9
generated_at: 2026-11-22T07:45:21.938335+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/integration/outcome-unknown.test.ts

## Purpose
Integration test, driven over real HTTP, for do-not-retry writes whose first attempt committed but never reported back. After the first attempt succeeds, its idempotency ledger record is rewritten to "in flight, an hour ago", which simulates a crash between the commit and the done-mark. The client then retries with the same `Idempotency-Key`. The test asserts that the write does not run again, the client gets 409 `IDEMPOTENCY_OUTCOME_UNKNOWN`, staff are notified exactly once with the subject named, and further retries replay the stored answer. There is one case per do-not-retry operation, so a new operation with no notice mapping fails here.

## Key elements
- `mockEnqueueEmail`: a Jest mock of `enqueueEmail` from the mailer adapter. It is reset before each test, and the test asserts on which mails were queued.
- `recipient()`: creates an admin with an authenticator app enabled (`recipient@example.com`), who is the one expected to be told.
- `bellOf(userId)`: lists the user's visible notifications through the notifications service, using a tenant-scoped caller. It keeps only items with code `shop-tasks.staff.outcome-unknown`.
- `noticeMailRecipients()`: the sorted `to` addresses of queued `notifications.staff-notice` mails whose subject starts with "Check the result".
- `crashAfterCommit(key)`: writes directly to the raw `idempotencyRecordModel.collection`. It sets `state: 'in_flight'` with `createdAt` and `updatedAt` an hour ago, and unsets the stored response fields. It bypasses the model because the model would restamp the timestamps.
- `codeOf(response)`: returns the first error code in a response body.
- `Case` / `CASES`: one row per operation, each with an `arrange()` that sets up the subject and returns `send(key)`, `subjectName`, `subjectId` and an `effect()` read.
  - `refund`: pays an order via `/payments`, then POSTs `/payments/:id/refunds`. The effect is the refund count and `amountRefunded`.
  - `ship`: creates a processing order, then POSTs a shipment on its fulfillment order. The effect is the shipment count.
  - `receive-stock` and `adjust-stock`: POST to `/inventory/levels/:id/receive` or `/adjust`. The effect is the product's `onHand` counter.
- `describe.each(CASES)`: the single test per case, with these steps:
  1. Send the write and check the status is below 300.
  2. Wait for the ledger record to reach `done`, then crash it.
  3. Retry and expect 409 `IDEMPOTENCY_OUTCOME_UNKNOWN`, with no `retry-after` header.
  4. Check the effect is unchanged.
  5. Wait for at least two notice mails, with no duplicate addresses and the recipient included.
  6. Check there is exactly one bell notice, with severity `error` and params `{ operation, subjectId, subjectName }`.
  7. Retry again and expect the same 409 with `idempotent-replayed: true`, and no new effect, bell notice or mail.

## Relationships
- `@infrastructure/adapters/mailer`: mocked, so the test inspects queued mail instead of sending it.
- `@infrastructure/http/middlewares/idempotency-model`: `idempotencyRecordModel` is read, to wait for `done`, and manipulated, to fake the crash.
- `@modules/notifications`: its `notificationsService` is used to read the staff bell.
- `@kernel/permissions` and `@kernel/access/tenant`: `callerInScope` and `DEPLOYMENT_TENANT_ID` build the tenant-scoped caller for the bell query.
- `@modules/users`, `products`, `orders` and `delivery` test factories: create the admin, products and counters, orders, and fulfillment orders.
- `@types`: supplies the order status enum used to create the processing order in the ship case.
- `@tests/*` support helpers:
  - `setup-test-db`: provides the test database.
  - `http`: provides `api` and `authenticateAs`.
  - `eventually`: polls for the async ledger and mail effects.
  - `callers`: provides `asRole`.

## Notes
- The first attempt's ledger record is written after the response leaves, so the test uses `eventually` to wait for `state: 'done'` before crashing it.
- Mail is sent after the in-app notices, one recipient after another, so the test waits for at least two mails rather than the first.
- The account that sent the write is among the mailed staff. The test checks that the recipient appears in the list and that addresses are not duplicated, not an exact list.
- A refund also produces its own staff mail and to-do. Filtering on the "Check the result" subject and the outcome-unknown code keeps those from affecting the assertions.
