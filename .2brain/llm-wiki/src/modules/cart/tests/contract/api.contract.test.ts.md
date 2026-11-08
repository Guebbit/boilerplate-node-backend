---
source: src/modules/cart/tests/contract/api.contract.test.ts
sha256: 461ae1bbe0e68ff2b01e5505eeb53c08b7efdcfa4dc64ec85594d189e9c16481
generated_at: 2026-11-08T05:18:54.010081+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/cart` route. Because `CartResponse` is a computed view (not a direct serialization of the document), these tests exercise the actual HTTP API to verify that each endpoint's response shape, status codes, and error envelopes match the documented contract. They deliberately build carts through the API rather than fixture builders, and they assert only shape/reachability — behavioural rules live in the service suites.

## Key elements

- **`authenticateWithCart(quantity?)`** — logs in a `user`-role account, attaches an address, creates a product, and POSTs it to `/cart/items`. Returns `{ bearer, product }` for subsequent assertions.
- **`mergeOnce(bearer, key?, quantity, id)`** — issues `POST /cart/merge` with a single guest line, optionally setting an `Idempotency-Key` header.
- **`heldOf(bearer, id)`** — reads `GET /cart` and extracts the current quantity for a given product id (returns `0` if absent).
- **`describe('GET /cart')`** — asserts empty-cart, populated-cart, insufficient-stock flag (`availability: 'insufficient_stock'`, `canIncrease`), per-line ceiling (`canIncrease: false`), and decimal-text `summary.totalPrice` + `currency`.
- **`describe('POST /cart/items')`** — verifies 200 (not 201, no `Location` header), line-growth on repeat add, 422 `CART_QUANTITY_LIMIT` for both ceiling-exceeding adds, and 404 for missing vs. inactive products.
- **`describe('POST /cart/items — who may shop')`** — parametrised over all eight roles (customer → admin) confirming no role gate on the basket.
- **`describe('POST /cart/merge')`** — happy-path result shape, 100-line limit (101 → 422), per-line reason codes in request order, and idempotency-key replay.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); likely registers global contract-matching helpers or jest setup.
- **`tests/support/http.ts`** — provides `api` (supertest wrapper), `authenticateAs`, `authenticateAsRole`, and `staleBearerFor`.
- **`tests/support/checkout-as.ts`** — provides `checkoutAs` and `shownTotal` (used to cross-check cart totals against what checkout expects).
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` temporarily sets `NODE_CART_LINE_MAX` for ceiling tests.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity context for API calls.
- **`tests/support/ids.ts`** — `MISSING_ID` is a well-formed-but-nonexistent id used for the 404 scope test.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` attaches a billing address so checkout-precondition tests can run.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds catalogue items with configurable `onHand`, `price`, `active`.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` (imported for downstream checkout assertions in the merge/checkout cross-checks).
- **`src/modules/users/tests/factories.ts`** — `createUser` (used indirectly by `authenticateAs` / role provisioning).
- **`src/modules/products/index.ts`** — exports `productService`, likely consulted for catalogue-scope verification.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` drains pending outbox events so post-mutation side-effects are observable before assertions.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t` for i18n-aware error-message assertions in contract branches.

## Notes

- **200, not 201, on `POST /cart/items`.** A cart line is a sub-resource of the user's cart; the response body is the *whole* cart, never a `Location` header. Tests explicitly assert `headers.location` is `undefined`.
- **"Add" means "grow".** Re-adding the same product increments the existing line (Shopify/commercetools convention). Two adds of qty 2 → 5 total.
- **Price is decimal text, not a number.** `summary.totalPrice` is a string like `'51.00'`; the contract forbids a numeric `expectedTotal` field.
- **Per-line ceiling defaults to 10** (`NODE_CART_LINE_MAX`). Tests use `withEnvironmentOverrides` to exercise both "would exceed" and "already exceeds" branches.
- **Merge line limit is 100.** The 101st line returns 422; the boundary is inclusive.
- **Cart is a computed view.** The file's docblock warns that a hand-written fixture would assert a shape the app never produces — always build through the API in these tests.
- **Role-gate is absent by design.** No role (including `customer`, `unverified`) is excluded from adding to the basket; the parametrised test guards against accidental gating.
