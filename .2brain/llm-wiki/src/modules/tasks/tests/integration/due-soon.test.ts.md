---
source: src/modules/tasks/tests/integration/due-soon.test.ts
sha256: 2dc1226c97a2a191aef3c6acbe4f3cf0f7e1ac70c5e10edfcf0290487ceda78c
generated_at: 2026-11-14T22:13:50.996393+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/due-soon.test.ts

## Purpose

Integration test (real database) for the `remindDueSoon` sweep. Verifies that an open task within three days of its deadline—and with a life long enough to matter—is announced exactly once as a `task.due_soon` domain event, while closed, overdue, too-short-lived, suppressed, or out-of-window tasks are left untouched.

## Key elements

- **`taskDue(dueInDays, lifeDays)`** — local helper that creates a system task via the factory and stamps its due-date and life window in one call; returns the task id.
- **`heard`** — module-level array that collects every `task.due_soon` event fact captured by the manual listener; reset in `beforeEach`.
- **`describe('remindDueSoon')`** — eight test cases covering: single announcement with correct payload fields (`taskId`, `kind`, `routeSet`, `work`); idempotency (second sweep returns 0); out-of-window skip (4 days); short-life skip (≤ 1 day); closed-task skip; overdue-task skip; overdue-after-early-warning still fires `remindOverdue`; privacy-category inclusion vs. ordinary-contact exclusion; uncategorised-contact exclusion; and `noDueSoon` suppression.

## Relationships

- **`src/modules/tasks/services/index.ts`** — imports `taskService`, the system under test; calls `remindDueSoon()` and `remindOverdue()`.
- **`src/modules/tasks/tests/factories.ts`** — imports `createSystemTask`, `giveLife`, `closeDirectly` to seed and mutate task state.
- **`src/kernel/events.ts`** — imports `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` and the `DomainEventMap` type to wire a manual listener and clean up between tests.
- **`src/kernel/outbox.ts`** — imports `settleOutboxNudges` to flush the async outbox relay before asserting on `heard`.
- **`src/modules/tasks/events.ts`** — imports the `TASK_DUE_SOON` event-name constant used to subscribe.
- **`src/modules/tasks/model.ts`** — imports `taskModel` to read back the `dueSoonNotifiedAt` stamp and to set the `noDueSoon` flag.
- **`src/modules/tasks/repository.ts`** — imports `taskRepository` to create an uncategorised contact task that the service path would not produce.
- **`src/types/index.ts`** — imports `TaskKind`, `TaskSource` for the uncategorised-task fixture.
- **`tests/support/setup-test-db.ts`** — called once at module top to configure the real test database before any test runs.

## Notes

- The suite calls `markDomainEventsWired()` in `beforeEach` because the outbox relay only delivers events where the bus has been explicitly marked wired; without it, `settleOutboxNudges()` would never dispatch.
- `settleOutboxNudges()` must be awaited *before* asserting on `heard`; the outbox delivery is asynchronous.
- Deduplication is verified implicitly: the second `remindDueSoon()` call resolves to `0`, and the test confirms `dueSoonNotifiedAt` is a `Date` on the stored document.
- The privacy-vs-ordinary test exercises `taskService.create` with `category: 'privacy'` vs. `'order'`, confirming the service-level filter is independent of the reminder logic.
