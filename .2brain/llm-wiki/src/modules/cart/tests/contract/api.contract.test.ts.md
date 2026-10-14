---
source: src/modules/cart/tests/contract/api.contract.test.ts
sha256: be5bc8a235a3f8d3bdca6525047edac1dcfcf4de77a733bd1daf2c3bdb5defa0
generated_at: 2026-10-14T15:14:13.538595+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose

Contract (shape) tests for every `/cart` endpoint. They assert the response envelope, status codes, and error structures that the API must produce, without re-testing business rules (those live in the service suites). The file exists because `CartResponse` is a computed view rather than a document serialization, so a hand-written fixture could not stand in for the real output.

## Key elements

- **`authenticateWithCart(quantity?)`** — Logs in a `user` role, seeds an address and a product, adds the product to the cart via `POST /cart`, and returns `{ bearer, product }`. All cart setup goes through the API, not a fixture builder.
- **`GET /cart` suite** — Verifies 200 + empty `items`, 200 + one line, and the `availability: 'insufficient_stock'` flag when quantity exceeds `onHand`.
- **`POST /cart` suite** — Covers 201 (new line, `Location` header), 200 (growing an existing line, no `Location`), 422 `CART_QUANTITY_LIMIT` (per-line ceiling via `NODE_CART_LINE_MAX`), and 404 for missing or inactive products.
- **`POST /cart — who may shop` suite** — Parameterized over six staff roles expecting 403 `FORBIDDEN`, and over `customer`/`unverified` expecting 201.
- **`POST /cart/merge` suite** — Asserts per-line result objects (`requested`, `resulting`, `reason`, `availability`) in request order, idempotency-key passthrough, and the `cart.items` snapshot in the response.
- **`mergeOnce(bearer, key, quantity, id)`** — Small helper that builds a `POST /cart/merge` request, optionally setting `Idempotency-Key`.
- **`heldOf(bearer, id)`** — Reads back the quantity of a product from the cart via `GET /cart`; the single `as` cast is the only place the untyped supertest body is shaped.

## Relationships

- **`tests/support/contract.ts`** — Imported as a side-effect (`import '@tests/contract'`); likely registers shared `expect` matchers or global setup for contract assertions.
- **`tests/support/http.ts`** — Provides `api()`, `authenticateAs()`, `authenticateAsRole()` used for every request and auth setup.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to seed/clean the test database.
- **`tests/support/environment.ts`** — `withEnvironment('NODE_CART_LINE_MAX', …)` / `withoutEnvironment` scope the quantity-limit tests to a temporary env var.
- **`tests/support/checkout-as.ts`** — `checkoutAs` and `shownTotal` are imported for checkout-flow assertions (visible in the truncated tail).
- **`tests/support/ids.ts`** — `MISSING_ID` supplies a well-formed but non-existent ObjectId for 404 tests.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress(user.id)` seeds the billing address required by checkout.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` builds the product document referenced in cart lines.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` are available for order-related assertions further in the file.
- **`src/modules/users/tests/factories.ts`** — `createUser` is used where a specific user document is needed.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t` is imported for localized assertion strings or error-message checks.

## Notes

- The module doc states explicitly that these tests are *not* behavioural: they exist to ensure each contract branch (status, envelope shape, error code) is actually hit. Service-level suites own the "what happens" logic.
- `POST /cart` is intentionally **additive** (Shopify / commercetools convention): re-adding a product *grows* the existing line and returns **200** with no `Location`; only a brand-new line returns **201**. Tests assert both cases to pin this distinction.
- The `insufficient_stock` availability flag does **not** clamp the quantity to what is on hand — the line keeps the requested quantity and the flag is the only signal. The merge tests confirm this ("Short, and kept at what was asked").
- `heldOf` is the one place in the file that casts the supertest body (`as { productId; quantity }[]`); it is the contract's type guarantee, not a runtime check.
