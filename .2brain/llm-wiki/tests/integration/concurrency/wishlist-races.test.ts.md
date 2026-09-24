---
source: tests/integration/concurrency/wishlist-races.test.ts
sha256: 944045fb2dc640467db258d448f201136cc66cc04c176b28638db5def6c76211
generated_at: 2026-09-23T20:04:08.235715+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/wishlist-races.test.ts

## Purpose

Integration tests that verify the wishlist endpoints under concurrent access, ensuring race conditions cannot produce duplicate wishlist documents, duplicate product lines, or server errors. It is the wishlist counterpart to `cart-races.test.ts`; together they pin down the two repositories' claims about contention from the shape of their writes.

## Key elements

- **`describe('RW1 — concurrent saves of the SAME product')`** — Races N identical `POST /wishlist` calls; asserts all return 200, exactly one wishlist document exists, and it holds a single line (validates `$addToSet` idempotency).
- **`describe('RW1 — concurrent saves of DIFFERENT products')`** — Races N calls with N distinct products; asserts all return 200, one document, and all N lines present (distinguishes a working set-append from a broken one that coincidentally passes the single-product case).
- **`describe('RW2 — the FIRST save, raced')`** — Races N `POST /wishlist` calls from a guaranteed-empty wishlist (fresh account); asserts all 200, **zero 409s**, and exactly one document. The 409 assertion is explicit because a losing upsert (E11000) maps to 409, which `expectNoServerErrors` would not catch.
- **`describe('a save and a move-to-cart on the same line')`** — Races alternating `POST /wishlist` and `POST /wishlist/:id/move-to-cart` on one already-saved line; asserts no 5xx, 200+404 account for all responses, at most one document, and at most one line. Deliberately does **not** assert cart quantity.
- **`setupTestDb()`** — Called at module level to reset the test database before any test runs.
- **`RACE_SIZE`** (from `@tests/race`) — Concurrency fan-out count used by every `raceN` call.

## Relationships

- **`tests/support/http.ts`** — Source of `api()` (Supertest wrapper) and `authenticateAs()` (creates a fresh user + bearer token); every HTTP assertion in this file goes through them.
- **`tests/support/race.ts`** — Source of `raceN`, `countStatus`, `expectNoServerErrors`, and `RACE_SIZE`; supplies the concurrency harness and the status-counting discipline.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb()`, called once at the top of the module to guarantee a clean database.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct()` to seed the product documents that the raced endpoints reference.
- **`src/modules/wishlist/model.ts`** — Provides `wishlistModel`, used for direct MongoDB assertions on document count, item count, and product IDs after each race settles.

## Notes

- **RW2 must start from an empty wishlist.** `authenticateAs()` creates a fresh account so no wishlist document exists; once one does, `upsert` is never consulted and the document-level race is unreachable.
- **The 409 check in RW2 is load-bearing.** `expectNoServerErrors` only flags ≥500. A regression that turns the upsert filter from an exact `userId` match into a compound match would surface E11000 → 409, passing the 5xx guard while violating the "a repeat is not an error" contract.
- **The save+move test avoids asserting cart quantity.** `wishlistMoveToCart` reads "is it saved" before removing the line, so N concurrent moves all read "saved" and increment the cart N times. Changing that would contradict the shared `openapi.yaml` description and is a cross-repo contract change, out of scope for this test.
- **404 is a valid outcome in the save+move race.** If the line is already moved, `POST /wishlist` for that product is a no-op save (200) while the move returns 404; the test asserts `count(200) + count(404) === RACE_SIZE` rather than requiring all 200s.
- **RW1 uses two shapes (same product / different products) deliberately.** A single-product race cannot distinguish a correct `$addToSet` from a `$push` implementation that happens to de-duplicate by coincidence.
