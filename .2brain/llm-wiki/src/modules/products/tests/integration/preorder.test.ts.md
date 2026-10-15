---
source: src/modules/products/tests/integration/preorder.test.ts
sha256: b6e79cc9e19f92c171fc1b2808f17eca0a366ca9c45ef5a58a4576799cfef2d5
generated_at: 2026-10-15T11:48:36.685356+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/preorder.test.ts

## Purpose

Integration tests for the product preorder feature over HTTP. Verifies that a future `releaseDate` makes a product a derived preorder (never stored as a flag), that the date is bounded to one year ahead, that past dates read as released, and that any change to `releaseDate` writes a `product.release_date_changed` row into the outbox within the same transaction.

## Key elements

- **`inDays(days)`** — helper that returns an ISO-8601 string `days` from now (positive = future, negative = past).
- **`announced()`** — queries `outboxEventModel` for `PRODUCT_RELEASE_DATE_CHANGED` rows, sorted by `_id` (write order).
- **`announcedPayloads()`** — maps those rows to their `payload` fields for assertion.
- **`describe('GET /products/:id')`** — four tests confirming the derived `preorder` flag: true for future date, false for past date, false when `purchasable` is false, and that a preorder is never also flagged `lowStock`.
- **`describe('PATCH /products/:id releaseDate')`** — five tests covering: setting then clearing with `null` (two outbox rows: `to` then `from`), moving from one date to another (single row with both `from` and `to`), no-op when the stored value is unchanged (zero rows), rejection of a date > 1 year ahead (422, no rows), and acceptance of a past date (200, `preorder: false`).

## Relationships

- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the product document (with optional `releaseDate`, `purchasable`, `onHand`) for each test.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is the Mongoose model used to read back event rows and assert they were (or were not) written.
- **`src/modules/products/events.ts`** — `PRODUCT_RELEASE_DATE_CHANGED` constant identifies which outbox rows to query.
- **`tests/support/http.ts`** — `api` provides the supertest-style HTTP client; `authenticateAsRole('editor')` supplies a bearer token for write tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the test database once at module load.

## Notes

- `setupTestDb()` is called at the **module top level**, not inside `beforeAll` — the DB is ready before any `describe`/`it` runs.
- Preorder is a **derived** field computed at read time; the tests never assert a `preorder` column in the DB, only in the HTTP response body.
- The "announces nothing when the instant is the one already stored" test guards against duplicate outbox writes on idempotent PATCHes.
- Validation boundary is strictly > 365 days ahead → `422`; a past date is always accepted (reads as released).
- Outbox rows are asserted in **write order** via `_id` sort (Mongoose ObjectId monotonicity), so the set-then-clear test expects `[{to}, {from}]` in that exact sequence.
