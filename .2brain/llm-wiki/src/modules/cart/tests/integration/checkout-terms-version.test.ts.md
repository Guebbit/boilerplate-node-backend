---
source: src/modules/cart/tests/integration/checkout-terms-version.test.ts
source_sha256: 7b09e93ed5393f1a914c82831c2f1dfcf244cd81c26da6826b500d4719a73486
context_sha256: 4fc54ff9042eff38b254344b52c3d48993e4e524322036207025daf0a19cd628
generated_at: 2026-11-22T04:38:57.751095+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/checkout-terms-version.test.ts

## Purpose
Integration test verifying that an order placed through `POST /cart/checkout` freezes the Terms version in force at placement (like it freezes currency). A later bump of the Terms version must not change the version on an already-placed order.

## Key elements
- `fillCart(bearer, productId)`: adds one unit of the product via `POST /cart/items` and selects the `pickup` shipping method via `PUT /cart/shipping-method`, expecting 200 from both.
- `shopperReady()`: authenticates as `'user'`, gives that user an address, creates a product (price `'10.00'`, `onHand: 10`), fills the cart, and returns `{ bearer, product }`.
- Test "stamps the order with the version in force at placement": with `NODE_TERMS_VERSION` overridden to `'2026-11'`, checkout returns 201 and `body.termsVersion` is `'2026-11'`.
- Test "gives two orders two versions...": checks out under `NODE_TERMS_VERSION='v1'`, refills the cart, checks out under `'v2'`, then expects the first order's `termsVersion` to be `'v1'` and the second's `'v2'`.

## Relationships
- `@tests/http` (`tests/support/http.ts`): provides `api()` (HTTP client for the cart endpoints) and `authenticateAs()`.
- `@tests/checkout-as` (`tests/support/checkout-as.ts`): `checkoutAs(bearer)` performs the checkout request under test.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): `setupTestDb()` is called at module level to prepare the test database.
- `@tests/environment` (`tests/support/environment.ts`): `withEnvironmentOverrides` temporarily sets `NODE_TERMS_VERSION` around a callback.
- `src/modules/addresses/tests/factories.ts`: `giveAddress` creates the address needed to check out.
- `src/modules/products/tests/factories.ts`: `createProduct` creates the product to buy.

## Notes
- The Terms version is switched only around the `checkoutAs` call, so it is read at checkout time via the environment variable, not at setup.
- The cart must be refilled between the two checkouts in the second test (`fillCart` is called again), since the first checkout consumes it.
- `fillCart` and `shopperReady` are local helpers and aren't exported.
