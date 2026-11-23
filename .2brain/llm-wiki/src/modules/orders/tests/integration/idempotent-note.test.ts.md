---
source: src/modules/orders/tests/integration/idempotent-note.test.ts
source_sha256: 028bb2f06df6da120bc425f54c464342483391f6edaed8ec7798d16397bc25c5
context_sha256: 433ec0f04d3cecdcbb00f685fab3b684ed7207a7870f2dddcd4a44ea1dcd2646
generated_at: 2026-11-22T06:28:57.753134+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/idempotent-note.test.ts

## Purpose
Integration test for `POST /orders/{id}/timeline/notes` when sent with an `Idempotency-Key` header. It verifies that a retry with the same key replays the first response instead of writing a duplicate note, and that a new key still creates a new note.

## Key elements
- `leave(orderId, bearer, key, text)` – helper that POSTs a note to the order timeline with the given `Authorization` and `Idempotency-Key` headers and body `{ text }`.
- `noteCount(orderId)` – returns how many `note_added` rows the order's timeline holds (via `timelineOf`).
- `seed()` – creates a regular user, a product, and a `paid` order, then authenticates an `admin`. Returns `{ orderId, bearer }`.
- Test "writes one note and replays its answer to a retry" – sends the same request twice using `sendTwice`. It expects both responses to be `201`, the retry to carry the `idempotent-replayed: true` header, the retry body to equal the first body, and exactly 1 note stored.
- Test "writes another note for a new key" – sends a request twice under `note-key-1`, then sends once under `note-key-2`. It expects 2 notes stored.

## Relationships
- `src/modules/orders/tests/factories.ts` – supplies `createOrder`, `toOrderItem` and `timelineOf`.
- `src/modules/products/tests/factories.ts` – supplies `createProduct`.
- `src/types/index.ts` – supplies `OrderStatus`, used to seed the order as paid.
- `tests/support/http.ts` – supplies `api`, `authenticateAs` and `authenticateAsRole`.
- `tests/support/replay.ts` – supplies `sendTwice`, which returns `{ first, retry }`.
- `tests/support/setup-test-db.ts` – supplies `setupTestDb()`, called at module top level to set up the test database.

## Notes
- Imports use path aliases (`@tests/...`, `@modules/...`, `@types`) for support and module code. The order factories are imported relatively (`../factories`).
- Each test calls `seed()` itself, so every test gets its own order.
