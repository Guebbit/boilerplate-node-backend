---
source: src/modules/shop-tasks/tests/integration/delayed.test.ts
sha256: edf0597d70ae87011dc68f7296ef88a51174bbc662c31c016a911d695daaacfc
generated_at: 2026-11-08T08:18:00.255281+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/delayed.test.ts

## Purpose

Integration test for the `fulfillment_order.delayed` domain event. It verifies that a single emission produces both a `consent_due` task and a buyer notification, and that a redelivery (simulating outbox retry after a failed notification) is idempotent — the task is not duplicated and the notice is written exactly once.

## Key elements

- **`delayFor(userId)`** — Builds a `fulfillment_order.delayed` event payload with `shipCountry: 'US'` (activates the consent rule) and a fixed `eventId`-less structure.
- **`inboxOf(userId)`** — Shorthand for `notificationsService.list(userId)` to assert on the buyer's notification items.
- **"opens the consent reminder and tells the buyer, from one event"** — Emits the event once; asserts one `consent_due` task exists and the buyer received a `shop-tasks.fulfillment-delayed` notice.
- **"writes each once when a redelivery follows a notice that failed"** — Spies on `notificationsService.create` to reject once, emits the event twice with the same `eventId`; asserts the task count stays at 1 and the notice appears exactly once after the second delivery.

## Relationships

- **`src/kernel/events.ts`** — Source of `emitDomainEvent`, `resetDomainEvents`, and the `DomainEventMap` type; the event bus under test.
- **`src/kernel/registry.ts`** — `registerModules` wires the shop-tasks handler into the bus before each test.
- **`src/modules.ts`** — Provides `enabledModules`, the full module list registered in the test.
- **`src/modules/notifications/index.ts`** — Exposes `notificationsService`, the target of the assertion (and the spy in the redelivery test).
- **`src/modules/notifications/services/index.ts`** — The `create` method is the spy target in the failure simulation.
- **`src/modules/tasks/tests/factories.ts`** — `findTasksOfKind` queries the persisted task collection.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates the buyer fixture.
- **`src/types/index.ts`** — `TaskKind.consent_due` enum used in assertions.
- **`tests/support/setup-test-db.ts`** — Boots an in-memory/ephemeral DB for the suite.

## Notes

- The test pins the **redelivery contract**: task creation is idempotent by `eventId`; notification is written on the first successful `create` call. If you change the handler's ordering or idempotency key, this test will catch the regression.
- `shipCountry: 'US'` is not incidental — it is the condition that makes the module open a consent task. A non-US shipment would not produce a task.
- The redelivery test relies on the event bus logging the failed listener and continuing (no throw), then the second emission re-runs the handler. If the bus is changed to crash on first failure, the second `emitDomainEvent` call would never execute.
