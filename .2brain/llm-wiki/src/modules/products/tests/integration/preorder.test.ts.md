---
source: src/modules/products/tests/integration/preorder.test.ts
sha256: 207060ef4b305292d15e0535803e3486ef35e4a3a388f4e1368521c9d8622e22
generated_at: 2026-10-29T05:33:11.626476+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/preorder.test.ts

## Purpose

Integration tests (over real HTTP + a real test database) for the product preorder feature: verifying that `preorder` is derived from `releaseDate` (never stored), that the date is bounded to one year ahead, and that editing the date announces `product.release_date_changed` through the outbox in the same transaction.

## Key elements

- **`inDays(days)`** — returns an ISO-8601 string offset by *days* from now (positive = future, negative = past). Used as the client-side payload shape.
- **`announced()`** — queries `outboxEventModel` for rows named `PRODUCT_RELEASE_DATE_CHANGED`, sorted by `_id` (write order), returned as lean objects.
- **`announcedPayloads()`** — convenience wrapper that maps the above to just their `payload` fields.
- **`describe('GET /products/:id')`** — four cases covering: future date ⇒ `preorder: true`; past date ⇒ `false`; off-sale (`purchasable: false`) ⇒ `false` regardless of date; low-stock flag is suppressed on preorders.
- **`describe('PATCH /products/:id releaseDate')`** — five cases covering: set-then-clear round-trip and the two outbox payloads (`to`, then `from`); move from one future date to another produces a single `{from, to}` payload; setting the identical value writes no outbox row; a date > 1 year ahead is rejected (422, no outbox write); a past date is accepted and simply reads as released.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` supertest agent and `authenticateAsRole('editor')` used for every HTTP request and bearer-token setup.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module load to create/truncate the test database before any test runs.
- **`src/modules/products/tests/factories.ts`** — `createProduct(...)` builds a product document with the fields under test (`releaseDate`, `purchasable`, `onHand`).
- **`src/kernel/outbox.ts`** — `outboxEventModel` is the Mongoose model used to assert that the API wrote (or did not write) the expected outbox row(s).
- **`src/modules/products/events.ts`** — exports the `PRODUCT_RELEASE_DATE_CHANGED` event-name constant matched against outbox rows.

## Notes

- `setupTestDb()` is a top-level side effect; the test file must be imported (or run) before any test that depends on the DB state it establishes.
- The outbox assertions use `.lean().exec()` (Mongoose) and compare by `_id` order — the tests rely on write-order, not event sequencing.
- Clearing `releaseDate` via `null` is expected to yield `undefined` (key absent) in the JSON response, not `null`; the test asserts this explicitly.
- The "identical value" case is the key idempotency guard: no outbox row is written when the stored instant is unchanged, even though the HTTP call succeeds with 200.
