---
source: src/modules/tasks/tests/integration/model.test.ts
sha256: 7d89023f49b6e3ff204c834f3fde77e2acd0d44fa76947d245c331f4c4199288
generated_at: 2026-11-08T08:39:21.797674+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/model.test.ts

## Purpose

Integration tests that enforce a single invariant: the Task document must never expose `_id` or `__v` to the client, on **both** serialization paths — a hydrated Mongoose document (`toJSON`) and a `.lean()` list result (mapped manually via `applyTaskTransform`). Also verifies the TTL index definitions that drive message retention clocks.

## Key elements

- **`createTask()`** – module-level helper; inserts a task through `taskRepository.create` with a fixed reporter identity (`reporter@example.com`).
- **`describe('retention clocks')`** – asserts the live collection indexes contain a partial TTL on `createdAt` (only when `source: 'visitor'`) and a TTL on `closedAt`.
- **`describe('task serialization')`** – two tests:
  - *toJSON path*: creates a task, calls `task.toJSON()`, asserts `id` is present and `_id`/`__v` are absent from the JSON string.
  - *lean-list path*: calls `taskService.search({}, callerContextAs('admin'))`, asserts each item has an `id` matching a 24-hex ObjectId and has no `_id` or `__v` keys.

## Relationships

- **`src/modules/tasks/model.ts`** – provides `taskModel`; the test inspects its collection indexes and exercises its `toJSON` transform.
- **`src/modules/tasks/repository.ts`** – provides `taskRepository`; used by `createTask()` to seed data.
- **`src/modules/tasks/service.ts`** – provides `taskService`; its `search` method is the lean-list code path under test.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb()`, called once at module load to provision a clean test database.
- **`tests/support/callers.ts`** – provides `callerContextAs`, used to build an admin caller context for the service call.
- **`tests/support/stub.ts`** – provides `asStub`, a type-cast helper used to treat `items[0]` as a plain `Record<string, unknown>` for assertion.

## Notes

- The file's own doc-comment names the invariant explicitly; if you add a new serialization path (e.g. a cache layer), add a third test here.
- `setupTestDb()` runs at **module import time**, not inside `beforeAll` — the DB is ready before any `describe` block executes.
- The retention-clocks test reads real index metadata from MongoDB rather than simulating expiry, so it requires a running Mongo instance (consistent with the "integration" tag in the path).
- `createTask` is not parameterized; if a test needs a different `source` value, it must call `taskRepository.create` directly.
