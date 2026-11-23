---
source: src/modules/shop-tasks/tests/integration/delayed.test.ts
source_sha256: 6d163b36f627a0768ff76556fdce6907d3cd06d1e25767804bf9587a812b244d
context_sha256: 3ad7d1b4bfb57df3a85a63056d8f273743e3342ca8c63e23248227f1224299c6
generated_at: 2026-11-22T07:44:15.945947+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/integration/delayed.test.ts

## Purpose
Integration test pinning how the shop-tasks module handles the `fulfillment_order.delayed` domain event. The event is both a to-do (a consent-due task for the buyer) and a buyer notification, but a module holds only one handler per event. The test verifies the order inside that handler and the redelivery rule: open the task first (idempotent by `eventId`), then write the notice, so a redelivery after a failed notice repeats a no-op open and writes the notice only once.

## Key elements
- `setupTestDb()` — sets up the test database for the suite.
- `beforeEach` / `afterEach` — reset domain events and register `enabledModules` via `registerModules`; afterwards restore mocks and reset events again.
- `delayFor(userId)` — builds a `fulfillment_order.delayed` payload (typed as `DomainEventMap['fulfillment_order.delayed']`) with `shipCountry: 'US'`, so the consent rule applies.
- `inboxOf(userId)` — returns the items from `notificationsService.list(userId)`.
- Test 1: a single event opens one `TaskKind.consent_due` task and puts one notification with code `shop-tasks.fulfillment-delayed` in the buyer's inbox.
- Test 2: `notificationsService.create` is mocked to reject once (`'inbox down'`). The first emit leaves one task and an empty inbox. Re-emitting the same event with the same `eventId` leaves one task and one notification.

## Relationships
- `@kernel/events` — supplies `emitDomainEvent`, `resetDomainEvents` and the `DomainEventMap` type.
- `@kernel/registry` — `registerModules` wires the handlers.
- `src/modules.ts` — `enabledModules` is the module list registered, so the real handlers run.
- `@modules/notifications` — `notificationsService` is used to read the inbox and is spied on to simulate a failure.
- `@modules/tasks/tests/factories` — `findTasksOfKind` looks up the created tasks.
- `@modules/users/tests/factories` — `createUser` creates the buyer.
- `@types` — provides `TaskKind`.
- `@tests/setup-test-db` — provides `setupTestDb`.

## Notes
- The second test relies on the bus logging a failing listener and carrying on; the in-test comment says the outbox would deliver the event again, which the test simulates by emitting it a second time.
- Both emits in the redelivery test use the same `eventId` (`'e1'`), which is what makes the task open idempotent.
