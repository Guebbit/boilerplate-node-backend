# tests/integration/concurrency/wishlist-races.test.ts

## Purpose

Integration tests that verify the wishlist endpoints survive concurrent writes without producing duplicate documents, duplicate lines, or server errors. They specifically guard two invariants that the repository's shape (a set-append via `$addToSet` and an exact-equality `upsert` filter on `userId`) is supposed to provide, and they are the enforcement half of the same reasoning applied to the cart in `cart-races.test.ts`.

## Key elements

- **RW1 — same product** (`describe` block): N concurrent `POST /wishlist` of one product must all return 200 and leave exactly one document with one line. Catches a regression to `$push`.
- **RW1 — different products** (`describe` block): N concurrent saves of N distinct products must all succeed and produce one document with N lines. Needed because the single-product case cannot distinguish a working set-append from a broken one.
- **RW2 — first save, raced** (`describe` block): N concurrent saves against a brand-new account (no existing wishlist) must all return 200, produce zero 409s, and create exactly one document. Guards the atomicity of the `upsert` filter on the unique `userId` key.
- **Save + move-to-cart interleaved** (`describe` block): Alternating `POST /wishlist` and `POST /wishlist/:id/move-to-cart` on the same line must never yield a second wishlist, a duplicate line, or a 5xx. Deliberately does **not** assert cart quantity.

## Relationships

- **`tests/support/race.ts`** — supplies `RACE_SIZE`, `raceN`, `countStatus`, `expectNoServerErrors`; all concurrency mechanics go through this helper.
- **`tests/support/http.ts`** — `api()` builds the HTTP client; `authenticateAs()` creates a fresh user/token, which is what guarantees RW2 starts from an empty wishlist.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once before the suite to reset the database.
- **`src/modules/wishlist/model.ts`** — `wishlistModel` is used for direct MongoDB assertions (document count, line count) that the HTTP responses alone cannot verify.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct()` seeds the product documents that each race targets.

## Notes

- **409 is asserted by value in RW2, not just "no 5xx."** A losing upsert surfaces as E11000 → 409, which is below 500 and would pass `expectNoServerErrors` silently.
- **RW2 is only reachable with an empty wishlist.** Once the document exists, `upsert` is never consulted, so `authenticateAs()` (fresh account) is load-bearing for that test.
- **The move-to-cart test intentionally skips a cart-quantity assertion.** The endpoint reads "is it saved" before removing the line, so N concurrent moves can over-increment the cart. Closing that race would contradict `openapi.yaml`'s move-to-cart description; the issue is tracked in `HANDOFF_BEOLD.md` §7.
- **Adding a condition to the upsert filter breaks RW2.** The filter must remain an exact equality on `userId` (the unique index key) for mongod to resolve it atomically; a compound filter (like the cart's second step) loses the atomicity guarantee.
