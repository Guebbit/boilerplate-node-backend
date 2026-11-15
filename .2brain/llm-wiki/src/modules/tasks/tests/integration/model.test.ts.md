---
source: src/modules/tasks/tests/integration/model.test.ts
sha256: 621d72169a577f6f7a50af7aab697bff2219b82230e1963c0e848d2af85dd02d
generated_at: 2026-11-14T22:15:05.165281+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/model.test.ts

## Purpose

Integration test verifying two invariants of the task domain: (1) TTL indexes are defined correctly so MongoDB purges stale documents on schedule, and (2) serialized task objects never expose internal Mongoose fields (`_id`, `__v`) on either the hydrated (`toJSON`) or `.lean()` response path.

## Key elements

- **`createTask()`** – local helper that inserts a task via `taskRepository.create` with fixed fixture data (`reporter@example.com`).
- **`describe('retention clocks')`** – reads live index metadata from `taskModel.collection.indexes()` and asserts the TTL index shapes (a `createdAt` index scoped to `source: 'visitor'` and a `closedAt` index).
- **`describe('task serialization')`** – two tests:
  - *toJSON path*: creates a task, calls `toJSON()`, asserts `id` is the hex string and the serialized JSON contains neither `_id` nor `__v`.
  - *lean path*: calls `taskService.search` as admin, asserts the returned item has a 24-char hex `id` and that `_id`/`__v` are `undefined`.

## Relationships

- **`src/modules/tasks/model.ts`** – imports `taskModel`; tests its `toJSON` transform and its declared TTL indexes.
- **`src/modules/tasks/repository.ts`** – imports `taskRepository`; uses `create` to seed fixture data.
- **`src/modules/tasks/services/index.ts`** – imports `taskService`; exercises the `search` method to hit the `.lean()` serialization path.
- **`tests/support/callers.ts`** – imports `callerContextAs('admin')` to provide an authenticated admin caller context.
- **`tests/support/setup-test-db.ts`** – imports `setupTestDb` to provision a clean in-memory/ephemeral DB before the suite runs.
- **`tests/support/stub.ts`** – imports `asStub` to cast the lean result to a plain `Record` so individual field assertions are type-safe.

## Notes

- The file's module docstring is the source-of-truth statement of the invariant ("Tasks must never leak `_id`/`__v`"). If a future refactor breaks serialization, this file is the guard.
- The retention-clock test inspects **actual MongoDB index metadata** rather than the index-definition code, so it catches both missing indexes and incorrect `partialFilterExpression` values.
- The lean-path test relies on `asStub` to sidestep TypeScript; if `taskService.search` return type changes, this cast may need updating.
