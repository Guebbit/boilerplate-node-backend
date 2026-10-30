---
source: src/modules/cart/tests/contract/api.contract.test.ts
sha256: 361787791b899fda493d9c58a689b20761eed4cffd70ad13d554a59431df8bbc
generated_at: 2026-10-29T03:26:26.063399+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/cart` route (GET, POST items, POST merge, etc.). All six endpoints share one `CartResponseEnvelope`, making them a natural hiding place for serialization drift. Carts are built exclusively through the live API rather than fixture builders, because `CartResponse` is a computed view—not a serialization of the stored document—so a hand-written fixture would assert a shape the app never produces. Behavioral assertions live in the service suites; this file exists to confirm each contract branch is reachable and correctly shaped.

## Key elements

- **`authenticateWithCart(quantity?)`** – Logs in a user, seeds an address, creates a product, and POSTs one cart line. Returns `{ bearer, product }` for subsequent assertions.
- **`describe('GET /cart')`** – Covers empty cart, populated cart, `insufficient_stock` availability flag with `canIncrease: true`, per-line ceiling (`canIncrease: false`), and `summary.expectedTotal` expressed in minor units.
- **`describe('POST /cart/items')`** – Verifies 200 (not 201, no `Location` header), line growth on re-add, 422 `CART_QUANTITY_LIMIT` for ceiling violations, and 404 for both missing-id and inactive-product cases.
- **`describe('POST /cart/items — who may shop')`** – Parameterized across all eight roles; asserts each can successfully add a line.
- **`mergeOnce(bearer, key, quantity, id)`** – Thin wrapper around `POST /cart/merge` that optionally sets `Idempotency-Key`.
- **`heldOf(bearer, id)`** – Reads back a single line's quantity via `GET /cart`; returns `0` if absent.
- **`describe('POST /cart/merge')`** – Covers successful merge with per-line `availability` reasons, the 100-line acceptance / 101-line 422 boundary, and per-line result ordering.

## Relationships

- **`tests/support/http.ts`** – Source of `api()` (supertest client), `authenticateAs`, `authenticateAsRole`, and `staleBearerFor`; the primary HTTP mechanism for every assertion.
- **`tests/support/contract.ts`** – Imported for shared contract-test setup/helpers (likely response-envelope validation utilities).
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` is used to temporarily set `NODE_CART_LINE_MAX` and exercise ceiling enforcement.
- **`tests/support/checkout-as.ts`** – Provides `checkoutAs` and `shownTotal` (used in truncated portion for post-merge checkout assertions).
- **`tests/support/callers.ts`** – `testCallerContext` supplies the caller identity for API calls.
- **`tests/support/ids.ts`** – `MISSING_ID` constant used to simulate a nonexistent product id.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds catalog entries (with optional `onHand`, `price`, `active` overrides).
- **`src/modules/products/index.ts`** – Exports `productService`, imported here (used in truncated section).
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` ensures the user has a billing address required at checkout.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` used in truncated section for post-checkout assertions.
- **`src/modules/users/tests/factories.ts`** – `createUser` for role-specific test accounts.
- **`src/infrastructure/i18n/index.ts`** – `t` for internationalized error-message assertions.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` to flush async outbox side-effects before asserting.

## Notes

- **200, not 201, on `POST /cart/items`.** A cart line is a child of the cart resource; the response is always the full cart with no `Location` header. Tests explicitly assert `headers.location` is undefined.
- **Add-to-cart grows, not replaces.** Re-POSTing the same product increments the existing line (Shopify/commercetools convention). A test posts 2, then 3, and expects a total of 5.
- **Two distinct 404s.** A `MISSING_ID` and a real-but-inactive product both return 404, but the latter is a scope refusal, not a lookup miss. Both are tested separately to prevent a blanket "id not found" handler from masking the scope check.
- **Per-line ceiling is env-driven.** Defaults to 10; tests use `withEnvironmentOverrides({ NODE_CART_LINE_MAX: '2' })` to trigger the 422 path at a lower threshold.
- **`CartResponse` is a computed view.** The module docstring explicitly warns against fixture-based assertions because the shape depends on live product/inventory state at response time.
