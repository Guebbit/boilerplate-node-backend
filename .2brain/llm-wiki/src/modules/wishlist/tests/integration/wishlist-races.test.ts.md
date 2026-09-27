---
source: src/modules/wishlist/tests/integration/wishlist-races.test.ts
sha256: 944045fb2dc640467db258d448f201136cc66cc04c176b28638db5def6c76211
generated_at: 2026-09-27T15:46:59.153131+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/wishlist-races.test.ts

## Purpose

Integration tests for concurrent (raced) writes against the wishlist endpoints. They pin down two specific race classes — line duplication (RW1) and duplicate-document creation via `upsert` (RW2) — plus a mixed save-and-move-to-cart race. The file exists to enforce the invariants that `wishlist/repository.ts` claims from its write shape (`$addToSet`, exact-equality filter) rather than from application-level retries.

## Key elements

- **`describe('RW1 — concurrent saves of the SAME product')`** — Fires N parallel `POST /wishlist` calls with one `productId`; asserts all return 200, exactly one wishlist document exists, and it holds a single line.
- **`describe('RW1 — concurrent saves of DIFFERENT products')`** — Same shape but each racer sends a distinct product; asserts all N lines land on one document. Guards against a duplicate-losing implementation that would pass the single-product case.
- **`describe('RW2 — the FIRST save, raced')`** — Starts from a confirmed-empty wishlist so every racer's `upsert` is a live insert attempt. Asserts zero 409s (E11000 losers) and exactly one document created.
- **`describe('a save and a move-to-cart on the same line')`** — Alternates `POST /wishlist` and `POST /wishlist/:id/move-to-cart` across N racers. Asserts no second document, no duplicated line, no 5xx; tolerates 404 on the move side.
- **Module-level `setupTestDb()`** — Resets the test database before the suite runs.

## Relationships

- **`tests/support/http.ts`** — Provides `api` (supertest wrapper) and `authenticateAs` (creates a fresh user, returns bearer token). Every test authenticates through it.
- **`tests/support/race.ts`** — Provides `raceN` (fire N promises concurrently), `countStatus` (tally a status code), `expectNoServerErrors` (fail on any 5xx), and `RACE_SIZE` (concurrency count).
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb` for clean-state test isolation.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct` to mint the product IDs the racers reference.
- **`src/modules/wishlist/model.ts`** — Provides `wishlistModel` (Mongoose model) used directly for post-race DB assertions (document count, line count, line content).

## Notes

- **RW2 must start from an empty wishlist.** `authenticateAs` creates a fresh account, so no document exists yet. Once one exists, `upsert` is never consulted and the document race is unreachable.
- **409 is asserted by value, not via `expectNoServerErrors`.** A losing upsert surfaces as E11000 → 409, which is below 500 and would slip past the generic error check. The test explicitly asserts `countStatus(results, 409)).toBe(0)`.
- **The save + move-to-cart test deliberately does not assert cart quantity.** `wishlistMoveToCart` reads "is it saved" before removing the line, so N concurrent moves all read "saved" and increment the cart N times. Closing that would contradict the OpenAPI description shared across three repos; fixing it is a cross-repo contract change.
- **The multi-product RW1 case is not redundant with the single-product one.** A duplicate-losing implementation (e.g., swapping `$addToSet` for `$push` + service-level dedup) would pass the single-product assertion but fail the multi-product one.
