---
source: src/modules/feedback/tests/integration/schema-contract.test.ts
sha256: e2048bbfa98555eedd1b1d6a7480cb2b9f4dfb6f356e408ef9d103f85dc6ef0e
generated_at: 2026-09-27T14:54:12.316841+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/schema-contract.test.ts

## Purpose

Schema contract tests for the feedback-request Mongoose schema. Unlike sibling transform specs, this file asserts what Mongoose itself enforces at the schema level (serialization shape, defaults, required fields, `select: false`). It runs against a real MongoDB because a mocked model would only restate the mock's assumptions about Mongoose semantics.

## Key elements

- **`describe('feedback request schema')`** — Single test block containing one assertion:
  - **`it('serialises to id, never _id or __v')`** — Creates a feedback request via the repository, calls `.toJSON()`, and verifies the output exposes `id` (a string) while omitting `_id` and `__v`.

## Relationships

- **`src/modules/feedback/repository.ts`** — Provides `feedbackRequestRepository.create(payload)`, the sole write path exercised here. The test treats the repository as a thin pass-through to the Mongoose model it defines.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope (side-effect, no return value) to spin up a real Mongo instance for the suite.

## Notes

- The module doc-comment lists "defaults, `required` fields, and `select: false` on credentials" as intended coverage, but the current file contains only the serialization test. Additional schema-contract assertions are expected to land here (or were removed).
- `setupTestDb()` is invoked with no `await`; it relies on the test runner's connection lifecycle rather than an explicit disconnect.
