---
source: tests/integration/concurrency/cart-races.test.ts
sha256: 630b32412fe3941bae0aad96c56c182d41ccfd6a871a82f7ab94823889cc4c41
generated_at: 2026-09-23T20:03:52.538546+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/cart-races.test.ts

## Purpose

Integration tests that fire concurrent HTTP requests against the cart and checkout endpoints to verify the invariants behind two specific race conditions: **R2** (double-checkout producing duplicate orders) and **R3** (concurrent cart upserts producing duplicate lines or lost writes). The tests exist to lock in the conditional-write and retry-with-compensation designs in the cart repository and checkout flow, and to serve as the reference implementation for how concurrency bugs are exercised end-to-end.

## Key elements

- **`describe('R3 — concurrent writes of the SAME product')`** — Fires N parallel `POST /cart` with one product; asserts exactly one cart, one line, and every caller gets 200/201.
- **`describe('R3 — concurrent adds of DIFFERENT products')`** — Same shape but N distinct products; the only case that can distinguish a working `$ne`-in-filter guard from a broken one (a single-product race cannot).
- **`describe('R3 — concurrent quantity writes to the same line')`** — N parallel `PUT /cart/:id` with different quantities in SET mode; asserts the final quantity is one of the values sent (no merge artefact) and no second cart appears.
- **`describe('R2 — concurrent checkouts of one cart')`** — Six sub-tests covering: exactly one order created, 409 for losers (`CART_CHANGED`), cart emptied once, no orphan order from a loser, loser's product hold released (verified via `productService.findByIdRaw`), and a normal uncontended checkout still succeeds.
- **`describe('account deletion racing a cart write')`** — Verifies no orphaned cart document and no 5xx when account deletion and a cart write overlap. _(content truncated in source)_
- **Module-level `setupTestDb()`** — Truncates/reinitialises the test database before the suite runs.

## Relationships

- **`tests/support/race.ts`** — Supplies `raceN` (fan-out N concurrent requests), `countStatus`, `expectNoServerErrors`, and the `RACE_SIZE` constant used throughout.
- **`tests/support/http.ts`** — Provides `api` (supertest wrapper) and `authenticateAs` for issuing authenticated requests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` isolates each run from prior state.
- **`src/modules/cart/model.ts`** — `cartModel` is queried directly (`countDocuments`, `findOne`) to assert invariants (one cart, correct line count) that HTTP status codes alone cannot confirm.
- **`src/modules/orders/model.ts`** — `orderModel` queried directly to verify order count and item contents after checkout races.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates fixture products with controlled `onHand`/`price` for every test.
- **`src/modules/products/index.ts` / `src/modules/products/service.ts`** — `productService.findByIdRaw` is used to inspect the `reserved` field and confirm that losing checkouts released their stock hold rather than leaking it.

## Notes

- The file header documents the R2 and R3 bugs in detail; reading it first orients you on _what_ each `describe` block is protecting before reading the assertions.
- `POST /cart` and `PUT /cart/:productId` both use **SET** semantics (`cartItemSetById`), not increment. The repository's `add` mode exists but no route reaches it, so tests correctly assert "one line, correct quantity" rather than a sum.
- R2 losers are expected to **retract** their already-written order (compensation) and **release** their product hold. The tests verify both: order count stays at 1, and `reserved` equals only the winner's quantity.
- The multi-product race (second `describe`) is the only test that would fail if the `$ne`-in-filter guard were removed; the single-product race would pass either way.
- Assertions hit the database directly (`cartModel`, `orderModel`, `productService.findByIdRaw`) rather than relying solely on response bodies — this is intentional to catch invariants invisible in HTTP.
