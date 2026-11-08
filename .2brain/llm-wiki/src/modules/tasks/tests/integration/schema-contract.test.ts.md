---
source: src/modules/tasks/tests/integration/schema-contract.test.ts
sha256: d51c026d686eed8a77a00721be7779f7220aedecd2156df51e635bded2246fac
generated_at: 2026-11-08T08:40:00.064854+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/schema-contract.test.ts

## Purpose

Integration test that verifies Mongoose schema-level declarations on the task document (serialization shape, defaults, required fields, `select: false` credentials) by exercising a real Mongo instance. It exists separately from sibling transform specs because the behaviours under test belong to Mongoose itself, not to application logic — a mocked model would only assert the mock's own interpretation.

## Key elements

- **`setupTestDb()`** — called at module scope (before the `describe` block); provisions a real MongoDB connection for the test run.
- **`taskRepository.create(payload)`** — used inside the test to persist a task and obtain a Mongoose document whose `toJSON()` serialization is asserted.
- **`payload`** — minimal `{ email, routeSet, subject, message }` object passed to `create`; sufficient to satisfy required-field constraints.
- **Test: "serialises to id, never _id or __v"** — asserts that `task.toJSON()` exposes `id` (string form of `_id`) and omits both `_id` and `__v` keys.

## Relationships

- **`src/modules/tasks/repository.ts`** — exports `taskRepository`, the sole object under test; the test calls `create` on it to obtain a Mongoose document.
- **`tests/support/setup-test-db.ts`** — exports `setupTestDb`, which the file calls at import time to stand up the real Mongo connection before any test executes.

## Notes

- The module doc comment scopes the file to *schema declarations* (defaults, `required`, `select: false`) and explicitly excludes application transforms, which live in sibling specs. The single currently-present test covers the serialization contract; the other declared concerns (defaults, required fields, credential hiding) are not yet exercised here.
- A real Mongo instance is **required**; running this file without one will fail at the `setupTestDb()` step. It is intentionally not unit-testable with a mock model.
- `setupTestDb()` is invoked at top level (outside `beforeAll`), so the connection is established at import time rather than lazily per test.
