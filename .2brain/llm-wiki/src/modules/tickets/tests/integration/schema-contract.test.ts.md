---
source: src/modules/tickets/tests/integration/schema-contract.test.ts
sha256: a49e7a8c4ec7afd1845a07dcb4466aacd221736796a27e547d466c83e11ca5b1
generated_at: 2026-10-29T06:07:34.097389+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/integration/schema-contract.test.ts

## Purpose

Integration test that verifies the Mongoose ticket schema's serialization contract against a real Mongo instance. It asserts that a persisted ticket's `toJSON()` output exposes `id` (as a string) and omits `_id` and `__v`. The file intentionally runs against real Mongo rather than a mocked model so it tests Mongoose's actual serialization behaviour, not a mock's interpretation.

## Key elements

- **`setupTestDb()`** — called once at module scope; provisions a real test database (from the shared test-support helper).
- **`payload`** — minimal valid ticket fields (`email`, `routeSet`, `subject`, `message`) used to create a document via the repository.
- **`describe('ticket schema')` → `it('serialises to id, never _id or __v')`** — creates a ticket with `ticketRepository.create`, casts the result to `Record<string, unknown>`, and asserts that `serialized.id` equals `String(ticket._id)` while `_id` and `__v` are absent from the serialized object.

## Relationships

- **`src/modules/tickets/repository.ts`** — provides `ticketRepository.create()`; this test is the sole caller here, exercising the repository's write path to obtain a real Mongoose document whose serialization can be inspected.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, the shared helper that wires up a real Mongo instance for integration tests. Called at the top of this file before any assertions.

## Notes

- The file's module-level comment lists "defaults, `required` fields, and `select: false` on credentials" as the test's scope, but the current file contains only the single serialization assertion. If additional schema-contract tests are added, they belong in this file rather than sibling transform specs.
- The test casts the document with `as Record<string, unknown>` rather than relying on Mongoose's typed `toJSON()` return, which keeps the assertions agnostic to the repository's return type.
