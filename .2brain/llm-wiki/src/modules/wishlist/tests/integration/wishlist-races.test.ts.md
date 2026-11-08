---
source: src/modules/wishlist/tests/integration/wishlist-races.test.ts
sha256: 753273c1ff1ea5765974ab9c0d6a5a1051d8908ac74d35b08aa7d2bcc8896cab
generated_at: 2026-11-08T09:15:14.632349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/wishlist-races.test.ts

## Purpose

Integration tests that pin down the concurrency guarantees of the wishlist endpoints under parallel writes. They verify that `$addToSet` semantics prevent duplicate lines (RW1) and that the upsert filter's exact-equality shape prevents duplicate documents (RW2), and that interleaved save/move-to-cart operations never corrupt state. They exist because the repository's correctness argument rests on write-shape rather than a retry budget, and these tests are the executable statement of that argument.

## Key elements

- **RW1 — concurrent saves of the SAME product** — N parallel `POST /wishlist/items` for one product must all return 200 and leave exactly one wishlist document with one line.
- **RW1 — concurrent saves of DIFFERENT products** — Same shape with N distinct products; asserts N lines on a single document (guards against a broken set-append that merely deduplicates).
- **RW2 — the FIRST save, raced** — N parallel saves against a *fresh* (no-yet-wishlist) account must all return 200, produce exactly one document, and yield **zero** 409s.
- **a save and a move-to-cart on the same line** — Interleaved `POST /wishlist/items` and `POST /wishlist/items/:id/move-to-cart` must never produce a second wishlist, a duplicate line, or a 5xx. Accepts 200-or-404 as the full status set.

## Relationships

- **`tests/support/http.ts`** — Provides `api()` (request builder) and `authenticateAs()` (fresh-user creation + bearer token) used by every test.
- **`tests/support/race.ts`** — Provides `raceN` (fan-out N concurrent calls), `countStatus` (tally by HTTP code), `expectNoServerErrors` (assert no 5xx), and `RACE_SIZE` (concurrency level).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once to reset the test database before the suite.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` creates the product fixtures that are raced into the wishlist.
- **`src/modules/wishlist/model.ts`** — `wishlistModel` is queried directly after each race to assert document count and line contents at the storage layer.

## Notes

- **RW2 requires an empty wishlist.** `authenticateAs()` creates a fresh account so no document exists yet; once one exists, `upsert` is never consulted and the document race is unreachable. This is why RW2 is separated from RW1.
- **409 is asserted explicitly, not via `expectNoServerErrors`.** A losing upsert surfaces as E11000 → 409, which is below 500 and would slip past the generic server-error check.
- **Cart quantity is deliberately unasserted** in the save/move-to-cart test. `moveToCart` reads "is it saved" then writes the cart before removing the line, so N concurrent moves of one line increment the cart N times. Closing that gap is a cross-repo contract change governed by `openapi.yaml`, not a wishlist bug.
- **The header comment cross-references `cart-races.test.ts`.** The two files are counterparts: the wishlist is safe because its upsert filter is an exact-equality match on `userId` (the unique index key), while the cart's two-step filter (`userId` + `items.productId ≠`) is not, and does lose the race.
