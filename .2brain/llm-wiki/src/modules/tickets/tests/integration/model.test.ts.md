---
source: src/modules/tickets/tests/integration/model.test.ts
sha256: 8ada42ddd0a9a29f1a8b63e0a19fc446e65d617739614b6edc7fc589aced85d3
generated_at: 2026-10-29T06:07:07.946766+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/integration/model.test.ts

## Purpose

Integration test that verifies ticket objects never expose `_id` or `__v` on either serialization path: hydrated Mongoose documents (via `toJSON`) and lean query results returned through `ticketService.search`. It guards against a class of bug where an internal Mongoose field leaks into API responses.

## Key elements

- **`createTicket`** – local helper that calls `ticketRepository.create` with a fixed fixture (email, subject, message). Used by both tests.
- **`describe('ticket serialization')`** – single suite containing two tests:
  - *normalizes a hydrated document via `toJSON`* – asserts `json.id` equals the `_id` string, and the serialized JSON contains neither `_id` nor `__v`.
  - *normalizes a lean list via `ticketService.search`* – asserts the returned item has a valid 24-hex `id`, and that `_id` / `__v` are `undefined`.

## Relationships

- **`src/modules/tickets/repository.ts`** – `ticketRepository.create` is the sole way tickets are inserted in these tests.
- **`src/modules/tickets/service.ts`** – `ticketService.search` exercises the lean-query path under test.
- **`tests/support/stub.ts`** – `asStub` is used to cast the lean result so property access in assertions is type-safe without triggering TS errors on `undefined` keys.
- **`tests/support/callers.ts`** – `callerContextAs('admin')` supplies the caller identity required by `ticketService.search`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` runs at module scope to provision an isolated in-memory database before any test executes.

## Notes

- `setupTestDb()` is called at the top level of the module (not inside a `beforeAll` hook), so the database is ready before Jest even enters the `describe` block.
- The lean-path assertion uses `asStub` + `expect(item._id).toBeUndefined()` rather than `expect(items[0]).not.toHaveProperty('_id')`. This deliberately checks that the key is *absent or undefined* on the object, not merely that the value differs.
- The `toJSON` test relies on Mongoose's built-in `toJSON` virtual that maps `_id → id`; if a custom `toObject` transform in the model schema changes, this test is the first to fail.
