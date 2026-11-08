---
source: src/modules/tasks/tests/integration/due-soon.test.ts
sha256: 4dec72ba3ed8a238660e1aea47819bc07c2d6ce05aab1e134eec7f36c0ee6751
generated_at: 2026-11-08T08:38:41.253111+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/due-soon.test.ts

## Purpose

Integration tests for the `remindDueSoon` sweep against a real (in-memory) database. Verifies that an open task within three days of its deadline — with a life longer than that window — emits exactly one `task.due_soon` domain event, and that all other combinations (too early, too short a life, already closed, already overdue, opted-out, uncategorised, non-privacy contact) are left untouched.

## Key elements

- **`heard`** – module-level array that accumulates `task.due_soon` event payloads received during each test, reset in `beforeEach`.
- **`taskDue(dueInDays, lifeDays)`** – helper that creates a system task via the factory, then sets its deadline and life in one call; returns the task id.
- **`beforeEach` / `afterEach`** – reset the domain-event bus, subscribe a listener for `TASK_DUE_SOON`, and call `markDomainEventsWired()` so the outbox relay will deliver.
- **`describe('remindDueSoon')`** – eight cases covering:
  - positive reminder (kind, routeSet, work fields; idempotent second call returns 0; `dueSoonNotifiedAt` stamped).
  - task due in 4 days is skipped, then picked up when `now` is advanced.
  - task whose life is only 1 day is never reminded.
  - closed task is skipped and never stamped.
  - already-overdue task is not "due soon".
  - a task reminded early is still eligible for `remindOverdue` later.
  - privacy-category contact is reminded; order-category contact is not.
  - uncategorised `TaskKind.contact` is never reminded.
  - `noDueSoon: true` flag suppresses the reminder.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/tasks/service.ts` | System under test: calls `remindDueSoon()`, `remindOverdue()`, `create()`. |
| `src/modules/tasks/events.ts` | Imports the `TASK_DUE_SOON` event constant for subscription. |
| `src/kernel/events.ts` | Imports `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents`, and the `DomainEventMap` type. |
| `src/kernel/outbox.ts` | Calls `settleOutboxNudges()` to flush pending outbox messages before asserting. |
| `src/modules/tasks/tests/factories.ts` | Uses `createSystemTask`, `giveLife`, `closeDirectly` to seed state. |
| `src/modules/tasks/model.ts` | Reads stored task to assert `dueSoonNotifiedAt`; writes `noDueSoon` flag. |
| `src/modules/tasks/repository.ts` | Creates an uncategorised task directly (bypassing service validation). |
| `src/types/index.ts` | Imports `TaskKind` and `TaskSource` enums. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` at module load to provision the test database. |

## Notes

- `markDomainEventsWired()` must be called in `beforeEach`; without it the outbox relay silently drops events because it only delivers when the bus reports itself wired.
- `settleOutboxNudges()` is required after every `remindDueSoon` call that is expected to emit — the event travels through the outbox asynchronously, so assertions on `heard` will fail without the flush.
- The test asserts the return value of `remindDueSoon()` (the count of tasks reminded) *before* calling `settleOutboxNudges()`, confirming the count is determined synchronously while event delivery is not.
- The "still reminds after going overdue" test calls `remindOverdue()` (a different service method) to verify the two sweeps are independent, not mutually exclusive.
