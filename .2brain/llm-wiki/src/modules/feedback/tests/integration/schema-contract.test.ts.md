---
source: src/modules/feedback/tests/integration/schema-contract.test.ts
sha256: 444514e2aa57e25a3c60f207d35e44d124c07cff5c5aa33ed7f452447aea400b
generated_at: 2026-09-23T18:41:56.802881+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/schema-contract.test.ts

## Purpose

Integration test that verifies behaviors declared by the Mongoose schema itself (serialization, defaults, required fields, `select: false`) rather than application-level transforms covered by sibling specs. It runs against a real MongoDB instance because a mocked model would only assert the mock's opinion of Mongoose semantics.

## Key elements

- **`setupTestDb()`** — called at module top-level (outside `describe`); spins up a real Mongo instance for the entire file.
- **`payload`** — minimal fixture object (`email`, `subject`, `message`) used to create a feedback request document.
- **`it('serialises to id, never _id or __v')`** — the sole current test. Creates a document via the repository, then asserts that `toJSON()` exposes a string `id`, omits `_id`, and omits `__v`.

## Relationships

- **`src/modules/feedback/repository.ts`** — imports `feedbackRequestRepository`; calls its `.create()` method to materialise a real Mongoose document for inspection.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb`; provides the shared real-Mongo bootstrap (connect, teardown) this file relies on.

## Notes

- The JSDoc header describes a broader scope ("defaults, `required` fields, `select: false` on credentials") than the single serialization test currently present. Additional cases may be pending or were trimmed.
- `payload as never` is a deliberate type escape hatch to satisfy the repository's typed `create` signature without a full DTO import.
- `setupTestDb()` runs once at import time, not per-suite; the file is safe to run in parallel with other integration files only if the shared helper isolates databases.
