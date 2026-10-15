---
source: src/modules/cart/tests/contract/api.contract.test.ts
sha256: 8e832eba6c1d9c07f9976f3ff9d4fe3643cd610b1bdbb9073d8990e73485b4e1
generated_at: 2026-10-15T10:24:47.063956+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/cart` route. Because all six endpoints share one `CartResponseEnvelope` shape, a serialization change in one endpoint silently breaks the others; these tests assert the exact wire format each branch produces. Carts are built through the live API (not fixture builders) because `CartResponse` is a computed view, not a document dump — a hand-written fixture would assert a shape the app never serializes. Behavioural logic lives in the service suites; this file only verifies that each contract branch is reachable and shaped correctly.

## Key elements

- **`authenticateWithCart(quantity?)`** — Helper that logs in a user, seeds one address and one product, and adds the product to the cart via `POST /cart`. Returns `{ bearer, product }`. Used as setup across most test blocks.
- **`mergeOnce(bearer, key, quantity, id)`** — Thin wrapper around `POST /cart/merge` that conditionally sets the `Idempotency-Key` header.
- **`heldOf(bearer, id)`** — Reads `GET /cart` and extracts the quantity for a given product (returns `0` if absent). Used to assert post-merge state.
- **`describe('GET /cart')`** — Verifies 200, empty items array, and the `availability: 'insufficient_stock'` flag when quantity exceeds stock.
- **`describe('POST /cart')`** — Covers: new line (201 + `Location` header), growing an existing line (200, no `Location`), per-line ceiling enforcement via `NODE_CART_LINE_MAX` (422 `CART_QUANTITY_LIMIT`), 404 for missing product id, and 404 for an inactive (non-public) product.
- **`describe('POST /cart — who may shop')`** — Parameterized: six staff/admin roles get 403 `FORBIDDEN`; `customer` and `unverified` get 201.
- **`describe('POST /cart/merge')`** — Asserts per-line result objects (`requested`, `resulting`, `reason`, `availability`) in request order; covers summed, insufficient-stock, and removed (missing id) outcomes; tests idempotency-key replay.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported for side effects; registers the contract-test runner/harness. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module top to prepare a clean database. |
| `tests/support/http.ts` | `api()`, `authenticateAs()`, `authenticateAsRole()` provide the supertest client and auth helpers. |
| `tests/support/environment.ts` | `withEnvironment` / `withoutEnvironment` scope `NODE_CART_LINE_MAX` to individual test cases. |
| `tests/support/checkout-as.ts` | `checkoutAs`, `shownTotal` imported (used in truncated portion of the file for post-merge checkout assertions). |
| `tests/support/ids.ts` | `MISSING_ID` is a valid-but-nonexistent id used to exercise the 404/removed branches. |
| `src/modules/products/tests/factories.ts` | `createProduct` (with optional `{ onHand, active }` overrides) seeds catalogue rows. |
| `src/modules/addresses/tests/factories.ts` | `giveAddress` attaches a billing address to the user before checkout-related assertions. |
| `src/modules/users/tests/factories.ts` | `createUser` seeds role-specific accounts for the access-control block. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` imported (used in truncated portion for order-related merge assertions). |
| `src/infrastructure/i18n/index.ts` | `t` is imported; the i18n context must be active for error-message and availability-label assertions. |

## Notes

- **200 vs 201 on `POST /cart`:** A *new* line returns 201 with a `Location` header; *growing* an existing line returns 200 with no `Location`. The test explicitly asserts both to pin the Shopify/commercetools convention.
- **Inactive product ≠ missing id:** Both yield 404, but the comments distinguish them — the inactive case is a scope/permission refusal, not a lookup miss. The test creates a real row with `active: false` to hit that branch.
- **`heldOf` cast:** The response body is untyped (supertest); the single `as` cast is the only place the test names the expected shape. If the contract changes, this cast will not flag the drift — the `expect` calls do.
- **`withEnvironment` scoping:** `NODE_CART_LINE_MAX` is set per-test and restored after; tests that depend on the default limit must run outside a `withEnvironment` block.
- **Merge result order is contractual:** The test asserts the `lines` array is in *request* order, not sorted. A regression that sorts by product id will fail this suite even if every field is correct.
