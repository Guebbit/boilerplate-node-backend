---
source: src/modules/orders/tests/integration/idempotent-note.test.ts
sha256: 028bb2f06df6da120bc425f54c464342483391f6edaed8ec7798d16397bc25c5
generated_at: 2026-11-14T20:51:38.250568+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/idempotent-note.test.ts

## Purpose

Integration test for the `POST /orders/{id}/timeline/notes` endpoint's idempotency behavior. It verifies that a retry carrying the same `Idempotency-Key` replays the original 201 response without creating a second timeline entry, while a different key produces a new note.

## Key elements

- **`leave(orderId, bearer, key, text)`** — thin wrapper that issues the `POST` with `Authorization` and `Idempotency-Key` headers.
- **`noteCount(orderId)`** — queries the order's timeline for `'note_added'` rows and resolves the count.
- **`seed()`** — creates a product, a paid order (qty 1), and an admin bearer; returns `{ orderId, bearer }`.
- **Test 1 – "writes one note and replays its answer to a retry"** — fires the same key twice via `sendTwice`; asserts both responses are 201, the second carries `idempotent-replayed: true`, bodies match, and the timeline holds exactly 1 note.
- **Test 2 – "writes another note for a new key: two clicks make two"** — uses key `note-key-1` (retried), then a separate `note-key-2`; asserts the timeline holds 2 notes.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to provision/tear down the test database.
- **`tests/support/http.ts`** — provides `api` (HTTP client), `authenticateAs`, and `authenticateAsRole` used by `leave` and `seed`.
- **`tests/support/replay.ts`** — provides `sendTwice`, which issues the same request twice and returns `{ first, retry }` to simulate a lost-answer retry.
- **`src/modules/orders/tests/factories.ts`** — supplies `createOrder`, `toOrderItem`, and `timelineOf` for order/timeline setup and assertions.
- **`src/modules/products/tests/factories.ts`** — supplies `createProduct` for the order's line item.
- **`src/types/index.ts`** — supplies the `OrderStatus` enum used to seed the order as `paid`.

## Notes

- The test does not test the server's internal idempotency store; it only asserts observable behavior (status, `idempotent-replayed` header, body equality, row count).
- `noteCount` filters specifically on the `'note_added'` event type, so other timeline events (e.g. status changes) won't skew the count.
- The file is a module-level side-effect test (calls `setupTestDb()` at import time); the Jest `describe`/`it` blocks are the only test units.
