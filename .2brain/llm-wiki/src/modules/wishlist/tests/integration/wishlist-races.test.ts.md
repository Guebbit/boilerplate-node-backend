---
source: src/modules/wishlist/tests/integration/wishlist-races.test.ts
sha256: 2233d93c21798c7c447f3a7513ee91b5551c2784e160c1d87bce6cbb8a39f1ed
generated_at: 2026-10-15T12:28:43.943323+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/wishlist-races.test.ts

## Purpose

Integration tests that pin down the concurrency guarantees of the wishlist endpoints. They verify two distinct atomicity claims: (1) `$addToSet` on `items.productId` makes the line-level write idempotent regardless of interleaving, and (2) the `upsert` filter `{ userId }` is an exact match on the unique index key, so the document-level race resolves to a single insert. The tests exist to catch regressions—e.g. swapping `$addToSet` for `$push`, or adding a condition to the upsert filter—that would break one guarantee without breaking the other.

## Key elements

- **`describe('RW1 — concurrent saves of the SAME product')`** — fires N identical `PUT /wishlist/:productId` requests; asserts all return 200, exactly one wishlist document exists, and it holds exactly one line for that product.
- **`describe('RW1 — concurrent saves of DIFFERENT products')`** — fires N `PUT` requests each targeting a distinct product; asserts all return 200, one wishlist document, and N distinct lines. Exists because the single-product case cannot distinguish a correct set-append from a duplicate-losing implementation.
- **`describe('RW2 — the FIRST save, raced')`** — starts from a guaranteed-empty wishlist (fresh account), races N first-time saves of one product; asserts zero 409s, all 200s, and exactly one document. The explicit 409 count is the safety net for the losing-upsert → E11000 → 409 path.
- **`describe('a save and a move-to-cart on the same line')`** — pre-seeds one saved line, then races N alternating `PUT /wishlist/:id` and `POST /wishlist/:id/move-to-cart` calls; asserts no 5xx, no second document, and at most one line. Deliberately does **not** assert cart quantity (see Notes).

## Relationships

- **`tests/support/race.ts`** — supplies `raceN` (concurrent execution), `RACE_SIZE` (fan-out count), `countStatus` (per-status tally), and `expectNoServerErrors` (≥500 guard). Every test in this file uses all four.
- **`tests/support/http.ts`** — supplies `api` (supertest-style request builder) and `authenticateAs` (creates a fresh user + bearer token). `authenticateAs` is what guarantees the RW2 test starts from an empty wishlist.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the database before the suite runs.
- **`src/modules/products/tests/factories.ts`** — `createProduct` mints the product documents the tests reference.
- **`src/modules/wishlist/model.ts`** — `wishlistModel` is used for direct Mongoose assertions (document count, line count, line contents) that the HTTP layer alone cannot express.

## Notes

- **RW2 must start from an empty wishlist.** Once the document exists, `upsert` is never consulted and the document race is unreachable. `authenticateAs` guarantees a fresh account with no prior wishlist.
- **409 is asserted by value, not via `expectNoServerErrors`.** A losing upsert surfaces as E11000 → 409, which is below 500 and would silently pass the 5xx-only check.
- **The save + move-to-cart test does not assert cart quantity.** N concurrent moves of one saved line all read "saved" and increment the cart N times. Fixing that would contradict the `openapi.yaml` description and is a cross-repo contract change, out of scope here.
- **Pair with `cart-races.test.ts`.** The cart's second upsert step filters `{ userId, 'items.productId': { $ne } }`, which is *not* an exact unique-index match, so it loses the document race. The wishlist's exact `{ userId }` filter is the structural difference these tests pin down.
