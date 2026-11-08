---
source: src/modules/tasks/tests/integration/overdue.test.ts
sha256: ee8a0aa0d4d2bc421f93bfde38dea2e05ebf9aefb5c398f9258b61bd1d3fb5c9
generated_at: 2026-11-08T08:39:35.930595+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/overdue.test.ts

## Purpose

Integration tests for the `remindOverdue` sweep, run against a real database. Verifies that an open task past its due date is announced exactly once as a `task.overdue` domain event, is stamped (`overdueNotifiedAt`) to prevent re-announcement, and that closed, not-yet-due, or already-notified tasks are correctly skipped. Also covers outbox redelivery on handler failure and ordering of a multi-task backlog.

## Key elements

- **`dueAgo(hoursAgo)`** — helper that creates a system task via `createSystemTask` and backdates its `dueAt` field; negative values put the deadline in the future.
- **`heard`** — module-level array collecting `task.overdue` domain events fired during a test; reset in `beforeEach`.
- **`beforeEach` / `afterEach`** — wire a manual listener for `TASK_OVERDUE`, call `markDomainEventsWired()` so the outbox relay delivers, and tear down the bus in `afterEach`.
- **`describe('remindOverdue')`** — seven test cases:
  - Announces an overdue task with correct payload fields (`taskId`, `kind`, `routeSet`, `work`).
  - Second sweep returns 0 and the task carries `overdueNotifiedAt`.
  - A task closed before the sweep is untouched (no event, no stamp).
  - A not-yet-due task is skipped until its deadline passes.
  - A task with no `dueAt` is ignored.
  - A two-task backlog: both announced; outbox rows written oldest-deadline-first.
  - A handler that throws once → outbox row stays `pending` → after resetting `nextAttemptAt`, `relayOutbox()` redelivers and the row becomes `published`.
  - A reopened task (status reset to `TaskStatus.new`, `resolution` unset) is not re-announced.

## Relationships

- **`taskService.remindOverdue()`** (`service.ts`) — the SUT under test.
- **`TASK_OVERDUE`** (`events.ts`) — the event-name constant used to subscribe and to filter outbox rows.
- **`onDomainEvent`, `resetDomainEvents`, `markDomainEventsWired`** (`kernel/events.ts`) — manual event-bus wiring for the test harness.
- **`outboxEventModel`, `relayOutbox`, `settleOutboxNudges`** (`kernel/outbox.ts`) — inspect outbox row state, trigger redelivery, and flush microtask queues.
- **`taskModel`** (`model.ts`) — direct Mongoose reads to assert `overdueNotifiedAt` stamp and status.
- **`createSystemTask`, `backdateDue`, `closeDirectly`** (`factories.ts`) — fixture helpers that build and mutate tasks in the test DB.
- **`TaskStatus`** (`types/index.ts`) — used in the reopened-task test to reset status.
- **`setupTestDb`** (`setup-test-db.ts`) — spins up a real (in-memory) database for the suite.

## Notes

- The suite does **not** rely on application-level wiring; it calls `markDomainEventsWired()` and subscribes by hand. The outbox relay only delivers to a bus that has been explicitly wired, so omitting that call would silently drop events.
- The "oldest deadline first" test asserts **write order** in the outbox (`createdAt`, `_id` sort), not delivery order, because `relayOutbox` delivers rows in parallel.
- The redelivery test manually resets `nextAttemptAt` to epoch (`new Date(0)`) to bypass the backoff window and force an immediate retry.
- `HOUR_MS = 3_600_000` is a local constant, not imported from a shared time utility.
