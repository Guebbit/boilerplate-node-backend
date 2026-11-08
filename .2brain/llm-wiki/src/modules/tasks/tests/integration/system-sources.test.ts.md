---
source: src/modules/tasks/tests/integration/system-sources.test.ts
sha256: c5a27b793a32079dfc6459001ec26778870bc15e524294c4eea296a3cd042155
generated_at: 2026-11-08T08:40:45.217255+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/system-sources.test.ts

## Purpose

Integration test for the system-task engine: it verifies that specific domain events (flagged account, failed export) open a task in the correct jurisdiction, that their counterpart events close it, and that dedup semantics (repeat, redelivery, racing) behave as intended. It runs against a real database with the real module graph registered, exercising the full event → outbox → task pipeline rather than unit-level mocks.

## Key elements

- **`describe('what opens a task')`** — table-driven test asserting that `user.review_flagged` and `account.export_failed` each produce exactly one open task with the correct `kind`, `routeSet`, `status`, `source`, `openKey`, and `dueAt`. Also verifies the `work` screen path and that a *successful* export (`account.export_ready`) opens nothing.
- **`describe('what closes a task')`** — verifies `user.review_cleared` and a later `account.export_ready` resolve the task as `cleared` and free the `openKey`. Also confirms that if staff already resolved the task, a subsequent system-close is a no-op and staff notes are preserved.
- **`describe('dedup')`** — six tests covering: repeat event bumps `seenCount` but emits `TASK_OPENED` only once; a failed outbox listener is retried on the next relay pass; redelivery of the same `eventId` after close is ignored; a new `eventId` after close opens a second task; two racing events open a single task with `seenCount = 2`; `eventIds` array is bounded to 20 entries.
- **`watchOpened()`** — helper that subscribes to `TASK_OPENED` and returns the jest spy for call-count assertions.
- **`onlyTask()` / `allTasks()` / `eventIdsOnly()`** — small assertion helpers wrapping `taskModel` queries.
- **`nextEventId()`** — monotonically increasing fake `eventId` stamped the way the outbox would.

## Relationships

- **`src/kernel/events.ts`** — primary driver: `emitDomainEvent` fires the producer events; `onDomainEvent` subscribes for assertions; `resetDomainEvents` clears state between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes pending outbox rows so `TASK_OPENED` listeners run; `relayOutbox` re-processes a failed row; `outboxEventModel` is queried directly to assert pending/published state.
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` wires the real task module (and its event handlers) into the in-test event bus.
- **`src/modules.ts`** — supplies the `enabledModules` list passed to the registry.
- **`src/modules/tasks/model.ts`** — `taskModel` is the Mongoose model read and updated in assertions.
- **`src/modules/tasks/repository.ts`** — `taskRepository.appendNote` is called to simulate a staff note before the no-op close test.
- **`src/modules/tasks/events.ts`** — `TASK_OPENED` constant used by `watchOpened`.
- **`src/infrastructure/adapters/mailer.ts`** — mocked (`enqueueEmail`) so the test can assert on mail without sending; the test's contract is "the queue, not the mail."
- **`src/types/index.ts`** — `TaskKind`, `TaskResolution`, `TaskStatus` enums used in expectations.
- **`tests/support/setup-test-db.ts`** / **`tests/support/environment.ts`** — provide the in-memory DB and environment variables (e.g. `NODE_SUPPORT_EMAIL`).

## Notes

- The test uses `jest.mock` for the mailer at module level, but everything else (event bus, outbox, task handlers, DB) is the real production code — this is an integration test, not a unit test.
- `beforeEach` re-registers modules each time; `afterEach` only resets domain-event subscriptions. The DB is shared across tests within a run and cleaned by `setupTestDb`'s hooks, so test order can matter if state leaks.
- The dedup "bounded eventIds" test (25 events → 20 stored) encodes a retention cap that lives in the task module, not in the test.
- The outbox retry test manually sets `nextAttemptAt` to epoch `0` to force an immediate re-try, bypassing real backoff timing.
