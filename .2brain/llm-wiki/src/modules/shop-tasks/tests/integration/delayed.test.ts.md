---
source: src/modules/shop-tasks/tests/integration/delayed.test.ts
sha256: 6d163b36f627a0768ff76556fdce6907d3cd06d1e25767804bf9587a812b244d
generated_at: 2026-11-14T21:55:31.053341+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/delayed.test.ts

## Purpose

Integration test that pins the `fulfillment_order.delayed` event contract: a single emission must both open a `consent_due` task for the buyer **and** write a notification, and a redelivery of the same `eventId` after a failed notice must re-run a no-op task open while delivering the notice exactly once. It guards the "task-first, notice-second" ordering that makes the handler safe under outbox redelivery.

## Key elements

- **`delayFor(userId)`** – Builds a `DomainEventMap['fulfillment_order.delayed']` payload with `shipCountry: 'US'` (so the consent rule applies) and a fixed `eventId` context (`'e1'`).
- **`inboxOf(userId)`** – Wraps `notificationsService.list(userId)` to return the buyer's notification items for assertion.
- **`describe('fulfillment_order.delayed')`** – Two-test suite:
  - *"opens the consent reminder and tells the buyer, from one event"* – Emits the event once; asserts exactly one `consent_due` task exists and the inbox contains the `shop-tasks.fulfillment-delayed` code.
  - *"writes each once when a redelivery follows a notice that failed"* – Spies on `notificationsService.create` to reject once, emits twice with the same `eventId`; asserts the task count stays at 1 and the inbox gains exactly one entry.
- **`beforeEach` / `afterEach`** – Resets the domain-event bus, re-registers modules, and restores mocks between tests.

## Relationships

- **`src/kernel/events.ts`** – Supplies `emitDomainEvent`, `resetDomainEvents`, and the `DomainEventMap` type; the test drives the bus directly rather than calling the handler.
- **`src/kernel/registry.ts`** – `registerModules` wires the shop-tasks handler (and others) into the bus for each test.
- **`src/modules.ts`** – Exports `enabledModules`, the list passed to `registerModules`.
- **`src/modules/notifications/index.ts`** – Exports `notificationsService`; the test calls `list` to read the inbox and spies on `create` to simulate failure.
- **`src/modules/notifications/services/index.ts`** – Underlying service implementation behind `notificationsService` (spied in the redelivery test).
- **`src/modules/tasks/tests/factories.ts`** – Provides `findTasksOfKind` to query tasks by kind.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser` to seed a buyer row.
- **`src/types/index.ts`** – Exports the `TaskKind` enum used to parameterise the task query.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the in-memory MongoDB before the suite runs.

## Notes

- The module doc block explicitly frames these tests as **contract pins** (ordering + idempotency), not mere regression checks. If the handler reorders "notice before task" or drops the `eventId` dedup key, the second test fails.
- `shipCountry` is hard-coded to `'US'` to ensure the consent-reminder branch fires; a different country would skip task creation and the test would silently pass with 0 tasks.
- The redelivery test relies on the event bus logging (not throwing) a listener failure and continuing—this is the outbox-redelivery assumption stated in the inline comment.
