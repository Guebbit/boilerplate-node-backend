---
source: src/modules/tasks/tests/integration/overdue.test.ts
sha256: b52769972e192dc217082720cf607dae5ff120fc3c6b593076d8a81df7c36e84
generated_at: 2026-11-14T22:15:43.217015+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/overdue.test.ts

## Purpose

Integration test for the overdue sweep, run against a real database. Verifies that an open task past its due date is announced exactly once as a `task.overdue` domain event (with correct payload), stamped to prevent re-announcement, and that closed, not-yet-due, or reopened tasks are left untouched.

## Key elements

- **`dueAgo(hoursAgo)`** – local helper that creates a system task and backdates its due field; a negative argument means the task is *not* yet due.
- **`heard: DomainEventMap['task.overdue'][]`** – module-level array that accumulates every `task.overdue` fact emitted during a test; reset in `beforeEach`.
- **`describe('remindOverdue')`** – seven cases covering:
  - Payload correctness (`kind`, `routeSet`, `work`).
  - One-shot announcement + `overdueNotifiedAt` stamp on the task document.
  - Closed-before-sweep and not-yet-due tasks are skipped (no event, no stamp).
  - Task with no due date is ignored.
  - Backlog sweep: oldest deadline claimed first (asserted via outbox row write order, not delivery order).
  - Outbox redelivery: a handler that throws on first attempt succeeds on the next `relayOutbox()` pass.
  - Reopened task is not re-announced (both deadline and stamp persist).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/events.ts` | Subscribes to `TASK_OVERDUE` via `onDomainEvent`; calls `markDomainEventsWired()` so the outbox relay can deliver; resets state between tests. |
| `src/kernel/outbox.ts` | Uses `settleOutboxNudges()` to flush pending relay work; in the redelivery test inspects/rewrites `outboxEventModel` rows and calls `relayOutbox()` directly. |
| `src/modules/tasks/events.ts` | Imports the `TASK_OVERDUE` constant used as the event name. |
| `src/modules/tasks/model.ts` | Reads back task documents (`taskModel.findById`, `taskModel.updateOne`) to assert the `overdueNotifiedAt` stamp and to simulate a reopen. |
| `src/modules/tasks/services/index.ts` | SUT: imports the task service and calls its `remindOverdue` sweep method (optionally with a custom "now" date). |
| `src/modules/tasks/tests/factories.ts` | `createSystemTask`, `backdateDue`, `closeDirectly` – the test fixtures this suite builds on. |
| `src/types/index.ts` | Imports the `TaskStatus` enum; uses its `new` value to simulate reopening a task. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions the real (in-memory or temp) database before the suite runs. |

## Notes

- **Real DB, not mocks.** The suite exercises Mongoose queries and the outbox table directly; CI must provide (or the helper must spin up) a database instance.
- **Manual bus wiring.** `markDomainEventsWired()` is called in `beforeEach` because the production bootstrap does this automatically; without it the outbox relay would drop events silently.
- **Parallel relay, ordered writes.** The "whole backlog" test asserts only the *write* order in the outbox table (`createdAt` + `_id` sort), not the order listeners receive events, because `relayOutbox` dispatches aggregates concurrently.
- **`dueAgo` negative ≠ error.** Passing a negative number means "due date is in the future"; the sweep must skip it. This is the primary mechanism for the "not yet due" scenario.
- **Redelivery test resets `nextAttemptAt` to epoch** (`new Date(0)`) to bypass backoff and force an immediate retry on the next `relayOutbox()` call.
