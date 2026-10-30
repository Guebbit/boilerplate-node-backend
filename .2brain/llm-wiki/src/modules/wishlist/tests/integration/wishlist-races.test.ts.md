---
source: src/modules/wishlist/tests/integration/wishlist-races.test.ts
sha256: 753273c1ff1ea5765974ab9c0d6a5a1051d8908ac74d35b08aa7d2bcc8896cab
generated_at: 2026-10-29T06:36:10.351928+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/wishlist-races.test.ts

## Purpose

Integration tests that pin down the concurrency invariants of the wishlist endpoints. The file validates two distinct race classes—**RW1** (duplicate lines from concurrent saves of the same product, guarded by `$addToSet`) and **RW2** (duplicate wishlist documents from concurrent first-saves via `upsert`)—plus a mixed save/move-to-cart interleaving. Each test fires `RACE_SIZE` concurrent requests and asserts on final database state, not just HTTP status codes.

## Key elements

- **`setupTestDb()`** — called at module scope; resets the test database before the suite runs.
- **`describe('RW1 — concurrent saves of the SAME product')`** — N racers save the same `productId`; asserts exactly one wishlist document with one line, all responses `200`.
- **`describe('RW1 — concurrent saves of DIFFERENT products')`** — N racers each save a distinct product; asserts one wishlist with N lines. Exists because the same-product variant cannot distinguish a working `$addToSet` from a broken `$push` that merely deduplicates.
- **`describe('RW2 — the FIRST save, raced')`** — all racers hit an empty account (no wishlist yet), so every `upsert` is a live insert. Asserts zero `409`s, all `200`, and exactly one document. The `409` count is asserted explicitly because `E11000` → `409` would slip past `expectNoServerErrors`.
- **`describe('a save and a move-to-cart on the same line')`** — even-indexed racers save, odd-indexed racers move-to-cart. Asserts no second wishlist, at most one line, and `200 + 404 = RACE_SIZE`. Deliberately does **not** assert cart quantity (see Notes).

## Relationships

- **`tests/support/race.ts`** — supplies the entire concurrency harness: `raceN` (fire N promises), `RACE_SIZE` (default racer count), `countStatus` (tally by code), `expectNoServerErrors` (assert no 5xx).
- **`tests/support/http.ts`** — supplies `api` (supertest-style HTTP client) and `authenticateAs` (creates a fresh user + bearer token).
- **`tests/support/setup-test-db.ts`** — supplies `setupTestDb` for per-module DB reset.
- **`src/modules/products/tests/factories.ts`** — supplies `createProduct` to produce the product IDs under contention.
- **`src/modules/wishlist/model.ts`** — supplies `wishlistModel` (Mongoose model) for direct MongoDB assertions on document count, line count, and `productId` values after the race settles.

## Notes

- **RW2 requires an empty wishlist.** `authenticateAs` creates a fresh account with no wishlist, so the `upsert` filter `{ userId }` is a live insert attempt. If the document already exists, `upsert` is never consulted and the race is gone.
- **`409` is a contract-relevant status here.** A regression in the `upsert` filter (e.g., adding a non-exact condition) would cause losers to surface `E11000` → `409`, which is below 500 and invisible to `expectNoServerErrors`. The `countStatus(results, 409)` assertion is the only guard.
- **Cart quantity is intentionally unasserted** in the save/move-to-cart test. `wishlistService.moveToCart` reads "is it saved" before removing the line, so N concurrent moves of one saved line can each increment the cart. Closing that gap would require changing the shared `openapi.yaml` contract across multiple repos and is out of scope for this file.
- **Sibling file:** `cart-races.test.ts` applies the same reasoning pattern to the cart repository, which uses a non-exact filter (`{ userId, 'items.productId': { $ne } }`) and therefore *does* lose under `upsert`. The wishlist's exact-equality filter on `userId` (the unique index key) is what keeps RW2 safe.
