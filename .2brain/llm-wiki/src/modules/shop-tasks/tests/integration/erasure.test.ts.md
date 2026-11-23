---
source: src/modules/shop-tasks/tests/integration/erasure.test.ts
source_sha256: bd5f377680825067c53a86d579e4b4d2bf2fe56fb6f5fb51b5068267dca5e0c2
context_sha256: 464027f9976f63e6a15589622e0d5affcc893426000cfe651d2dc737b94a45ad
generated_at: 2026-11-22T07:44:44.795309+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/integration/erasure.test.ts

## Purpose
Integration test verifying that erasing a person keeps the shop's to-dos about their orders. The task record outlives the account; only the pointer to the person (`subjectId`) is removed.

## Key elements
- `setupTestDb()` – called at module level to prepare the test database.
- `ACCOUNT_ID` – constant id of the account being erased.
- Test `keeps a task about an order and detaches the person from it`:
  - Creates a system task linked to an order (`TaskLinkType.order`, id `order-1`) about `ACCOUNT_ID`.
  - Calls `taskService.eraseOwnTasks(...)` inside `withTransaction`, with `userId: ACCOUNT_ID`, `email: 'victim@example.com'` and `emailVerified: true`.
  - Reloads all tasks and asserts the original task still exists and its `subjectId` is not set (`toBeUndefined`).

## Relationships
- `tests/support/setup-test-db.ts` (`@tests/setup-test-db`) – provides `setupTestDb`.
- `src/infrastructure/runtime/database.ts` – provides `withTransaction`, which supplies the session passed to the service.
- `src/modules/tasks/index.ts` – exports `taskService`, whose `eraseOwnTasks` is the code under test (implemented in the tasks services).
- `src/modules/tasks/tests/factories.ts` – provides `createSystemTaskAbout` (seeds data) and `findAllTasks` (reads back stored tasks).
- `src/types/index.ts` – provides the `TaskLinkType` enum.

## Notes
- The test lives in `shop-tasks` but exercises the `tasks` module's service and factories.
- Task identity is compared via `String(task._id)`.
- It covers only the order-linked case. No other link types or deletion paths are tested here.
