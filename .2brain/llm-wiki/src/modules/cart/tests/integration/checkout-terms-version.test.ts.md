---
source: src/modules/cart/tests/integration/checkout-terms-version.test.ts
sha256: 7b09e93ed5393f1a914c82831c2f1dfcf244cd81c26da6826b500d4719a73486
generated_at: 2026-11-14T19:33:37.627755+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-terms-version.test.ts

## Purpose

Integration test verifying that a checkout stamps the order with the Terms version in force at the moment of placement, and that bumping `NODE_TERMS_VERSION` between two checkouts leaves each order on its respective version — analogous to how currency is frozen at order time.

## Key elements

- **`fillCart(bearer, productId)`** — POSTs one unit of the given product to `/cart/items` and sets the shipping method to `pickup`, leaving the cart in a check-out-able state.
- **`shopperReady()`** — Authenticates a fresh `user`, gives them an address, creates a product (price `10.00`, stock 10), and fills the cart. Returns `{ bearer, product }` for subsequent assertions.
- **`setupTestDb()`** — Called at module top level; resets/seeds the database before the `describe` block runs.
- **Test: "stamps the order with the version in force at placement"** — Wraps the checkout in `withEnvironmentOverrides({ NODE_TERMS_VERSION: '2026-11' })` and asserts the response body carries that exact version.
- **Test: "gives two orders two versions when the Terms were bumped between them"** — Performs two checkouts under `NODE_TERMS_VERSION` of `'v1'` and `'v2'` respectively, re-filling the cart between them, and asserts each order carries its own version.

## Relationships

- **`tests/support/http.ts`** — Provides `api()` (supertest-style HTTP client) and `authenticateAs()` used by `fillCart` and `shopperReady`.
- **`tests/support/checkout-as.ts`** — Provides `checkoutAs(bearer)`, the single-call abstraction that triggers `POST /cart/checkout` and returns the full response.
- **`tests/support/environment.ts`** — Provides `withEnvironmentOverrides()`, which temporarily mutates `NODE_TERMS_VERSION` for the duration of the wrapped call, allowing per-checkout version switching.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb()` to prepare a clean database fixture before tests run.
- **`src/modules/addresses/tests/factories.ts`** — Provides `giveAddress(userId)` so the authenticated user has a shipping address on file.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct({ price, onHand })` to mint a purchasable product per test.

## Notes

- `NODE_TERMS_VERSION` is read **at checkout time**, not at process start. The tests rely on `withEnvironmentOverrides` to prove this by changing the value between two calls in the same process.
- The second test reuses the same product but calls `fillCart` a second time, implying the first checkout consumed (emptied) the cart.
- `product._id` is coerced with `String(...)` before sending, consistent with a Mongoose ObjectId that must arrive as a string in JSON.
