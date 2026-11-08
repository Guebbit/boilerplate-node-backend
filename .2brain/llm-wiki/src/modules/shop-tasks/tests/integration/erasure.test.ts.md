---
source: src/modules/shop-tasks/tests/integration/erasure.test.ts
sha256: bd5f377680825067c53a86d579e4b4d2bf2fe56fb6f5fb51b5068267dca5e0c2
generated_at: 2026-11-08T08:18:27.815382+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/erasure.test.ts

## Purpose

Integration test verifying that when a person's account is erased, shop to-do tasks that reference their orders are **retained** (the record outlives the account) while the pointer to the person (`subjectId`) is detached. It ensures the erasure path does not delete order-linked tasks.

## Key elements

- **`ACCOUNT_ID`** — constant (`65dc8a99604c307b702b5ccc`) identifying the account whose tasks will be erased.
- **`describe('erasing the person a shop to-do is about')`** — single test suite; no other cases.
- **`it('keeps a task about an order and detaches the person from it')`** — the sole test case:
  1. Creates a system task linked to an order (`TaskLinkType.order`) and to `ACCOUNT_ID` via `createSystemTaskAbout`.
  2. Calls `taskService.eraseOwnTasks` inside a `withTransaction` session.
  3. Asserts the task still exists in the DB but its `subjectId` is `undefined`.
- **`setupTestDb()`** — called at module scope to seed/reset the test database before any test runs.

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, used to initialize the in-test database.
- **`src/infrastructure/runtime/database.ts`** — provides `withTransaction`, wrapping the erasure call in a DB session/transaction.
- **`src/modules/tasks/index.ts`** — barrel import source for `taskService` (the service under test).
- **`src/modules/tasks/tests/factories.ts`** — provides `createSystemTaskAbout` (arranges a task with a person + order link) and `findAllTasks` (reads back persisted tasks for assertions).
- **`src/types/index.ts`** — provides the `TaskLinkType` enum used to specify the order link type.

## Notes

- This test lives under **shop-tasks** but exercises the **tasks** module's `eraseOwnTasks`. It exists here because the business rule under test is shop-specific: order-linked tasks must survive person erasure, whereas a generic tasks test would not cover that constraint.
- The erasure is invoked through `taskService.eraseOwnTasks` rather than a dedicated shop-tasks service, so the behavior is shared logic validated from the shop-tasks perspective.
- `setupTestDb()` runs at import time (module scope), not inside `beforeAll`; any test runner that imports this file triggers DB setup immediately.
