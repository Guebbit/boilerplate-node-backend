---
source: src/modules/tasks/tests/integration/idempotent-note.test.ts
sha256: 7e141cf0207034dece5820327d3027da6da44de9af2570ef980fc74974483d42
generated_at: 2026-11-14T22:14:55.423594+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/idempotent-note.test.ts

## Purpose

Integration test that verifies the `POST /tasks/{id}/notes` endpoint honors an `Idempotency-Key` header: a retried request must replay the original response rather than appending a duplicate note to the task thread. It exists because task notes have no delete endpoint, so an accidental double-submit would be unrecoverable.

## Key elements

- **`note(taskId, bearer, key, body)`** – Helper that issues a `POST /tasks/{taskId}/notes` request with an `Authorization` bearer token and an `Idempotency-Key` header.
- **`threadOf(taskId)`** – Reads the task document from MongoDB (via `taskModel.findById`) and returns the ordered array of note bodies.
- **`"appends one note and replays its answer to a retry"`** – Fires the same note twice under one key (`sendTwice`); asserts both responses are `200`, the retry carries `idempotent-replayed: true`, bodies match, and the thread contains exactly one note.
- **`"appends another note for a new key: two clicks make two"`** – Sends under `task-note-1` (twice, idempotent) then under `task-note-2` (once); asserts the thread now has two notes.

## Relationships

- **`tests/support/setup-test-db.ts`** – Calls `setupTestDb()` at module load to provision a clean database per test run.
- **`tests/support/http.ts`** – Uses `api` (supertest wrapper) and `authenticateAsRole` to issue authenticated HTTP calls.
- **`tests/support/replay.ts`** – Uses `sendTwice` to execute the same request twice and return both responses.
- **`src/modules/tasks/model.ts`** – Imports `taskModel` to read the `notes` array directly from the persisted document.
- **`src/modules/tasks/tests/factories.ts`** – Imports `createSystemTask` to seed a task in the test DB.

## Notes

- The test targets the **server-side idempotency layer** (likely middleware or a route handler in the tasks module), not the client. The assertion on the `idempotent-replayed` response header is the contract under test.
- `threadOf` uses `.lean()` and accesses `task.notes` as a plain array—this assumes `notes` is a subdocument array on the task schema, not a separate collection.
- The two tests share the same idempotency key format (`task-note-1`, `task-note-2`); no other side effects (e.g., audit logs) are verified here.
