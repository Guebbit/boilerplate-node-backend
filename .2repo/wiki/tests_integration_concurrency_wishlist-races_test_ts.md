# tests/integration/concurrency/wishlist-races.test.ts

## Purpose

Integration tests that exercise the wishlist repository's contention-safety claims under concurrent load. Where `cart/repository.ts` carries an explicit retry budget, `wishlist/repository.ts` argues its safety comes from the shape of its writes (`$addToSet` + exact-match `upsert` filter). These tests are the proof: they race the save and move-to-cart endpoints and assert the invariants those write shapes must uphold (one document, no duplicate lines, no 5xx, no spurious 409).

## Key elements

- **`setupTestDb()`** — called once at module scope; resets the test database before the suite runs.
- **RW1 — concurrent saves of the SAME product** — fires `RACE_SIZE` parallel `POST /wishlist` requests with one product; asserts all return 200, exactly one wishlist document exists, and it holds exactly one line.
- **RW1 — concurrent saves of DIFFERENT products** — fires `RACE_SIZE` parallel saves each with a distinct product; asserts all return 200, one document, `RACE_SIZE` lines. Exists because a single-product race cannot distinguish a working set-append from a duplicate-losing implementation.
- **RW2 — the FIRST save, raced** — starts from a guaranteed-empty wishlist (fresh `authenticateAs()` account), races `RACE_SIZE` saves; asserts all return 200, zero return 409, and exactly one document is created. This is the only state where `upsert` is a live insert.
- **Save + move-to-cart on the same line** — alternates `POST /wishlist` and `POST /wishlist/:id/move-to-cart` across `RACE_SIZE` concurrent calls; asserts no second document, no duplicate line, no 5xx. Deliberately does **not** assert cart quantity (see Notes).

## Relationships

- **`tests/support/race.ts`** — supplies `raceN`, `RACE_SIZE`, `countStatus`, `expectNoServerErrors`; the entire test body is built on these primitives.
- **`tests/support/http.ts`** — supplies `api()` (Supertest wrapper) and `authenticateAs()` (creates a fresh user + bearer token).
- **`tests/support/setup-test-db.ts`** — supplies `setupTestDb()` for per-file DB reset.
- **`src/modules/products/tests/factory.ts`** — supplies `createProduct()` to seed valid product IDs for the wishlist payload.
- **`src/modules/wishlist/model.ts`** — supplies `wishlistModel` (Mongoose model) used to query post-race DB state (document count, items array length).

## Notes

- **RW2 requires an empty wishlist.** Once the document exists, `upsert` is never consulted and the document race is unreachable. `authenticateAs()` guarantees this by creating a fresh account.
- **409 must be asserted explicitly.** A lost upsert surfaces as E11000, which `databaseErrorInterpreter` maps to 409 — below 500, so `expectNoServerErrors` would pass silently. The test therefore checks `countStatus(results, 409) === 0` by value.
- **The save+move-to-cart test does not assert cart quantity.** `wishlistMoveToCart` reads "is it saved" then writes the cart *before* removing the line, so N concurrent moves of one saved line all read "saved" and increment the cart N times. Fixing that would contradict `openapi.yaml`'s move-to-cart description (three repos must be byte-identical). Tracked in `HANDOFF_BEOLD.md` §7.
- **Sibling file:** `cart-races.test.ts` covers the cart half of the same reasoning (its second-step filter `{ userId, 'items.productId': { $ne } }` is *not* an exact match, so it genuinely loses under contention — hence the retry budget).
- **Idempotence is the contract for saves.** All participants in a save race are expected to return 200 because saving what is already saved is the state each caller requested; it is not a tolerated duplicate.
