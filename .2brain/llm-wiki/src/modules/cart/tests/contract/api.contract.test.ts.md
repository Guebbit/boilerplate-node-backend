---
source: src/modules/cart/tests/contract/api.contract.test.ts
sha256: 4f439f4087a7299ed880a734d809b359ba49e68b3d1959558f961c9233bc23b0
generated_at: 2026-11-14T19:32:50.266077+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose
Contract tests that verify every `/cart` endpoint returns the correct `CartResponseEnvelope` shape, status codes, and error structure. Because `CartResponse` is a computed view (not a document serialization), tests exercise the real API rather than hand-written fixtures, ensuring each contract branch—stock flags, ceiling enforcement, merge results, role-gating—is actually reached through the HTTP boundary.

## Key elements
- **`authenticateWithCart(quantity?)`** – Helper that logs in a user, attaches a billing address, creates a product, and POSTs one cart line; returns `{ bearer, product }` for subsequent assertions.
- **`mergeOnce(bearer, key, quantity, id)`** – Sends a single-line `POST /cart/merge`, optionally attaching an `Idempotency-Key` header.
- **`heldOf(bearer, id)`** – Reads back the quantity of a product from `GET /cart` to verify post-merge state.
- **`describe('GET /cart')`** – Covers empty cart, populated cart, `insufficient_stock` flag + `canIncrease`, per-line ceiling (`canIncrease: false`), and the `summary.totalPrice` / `currency` decimal-text format.
- **`describe('POST /cart/items')`** – Covers add-new (200, no `Location`), add-grow (existing line increments), 422 `CART_QUANTITY_LIMIT` (both over-cap and already-over), 404 for missing product, and 404 for inactive product (scope refusal).
- **`describe('POST /cart/items — who may shop')`** – Parameterized over all eight roles confirming every authenticated user can add to the basket.
- **`describe('POST /cart/merge')`** – Covers successful merge, the 100-line cap (101 → 422), per-line result reasons in request order, idempotency-key replay, and guest-to-user line transfer.

## Relationships
- **`tests/support/http.ts`** – Provides `api()`, `authenticateAs`, `authenticateAsRole`, and `staleBearerFor` for all HTTP calls and bearer-token setup.
- **`tests/support/contract.ts`** – Imported for side effects (registers contract matchers / global setup before tests run).
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` wraps tests that need a specific `NODE_CART_LINE_MAX_QUANTITY` value.
- **`tests/support/checkout-as.ts`** – `checkoutAs` and `shownTotal` are used in later checkout-related contract blocks to cross-check cart totals.
- **`tests/support/callers.ts`** – `testCallerContext` supplies a caller identity for request-scoped assertions.
- **`tests/support/ids.ts`** – `MISSING_ID` is the canonical invalid-object-id used to trigger 404 paths.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds catalogue items (with configurable `onHand`, `price`, `active`).
- **`src/modules/products/index.ts`** – `productService` is imported for inventory mutation within a test.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` attaches a billing address required by checkout.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` used in post-checkout assertions.
- **`src/modules/users/tests/factories.ts`** – `createUser` for role-specific or multi-user scenarios.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes outbox side-effects so tests observe settled state.
- **`src/infrastructure/i18n/index.ts` / `src/infrastructure/i18n/context.ts`** – `t` is imported for locale-sensitive string assertions.

## Notes
- **200, not 201:** `POST /cart/items` deliberately returns 200 with the full cart body and no `Location` header. Tests assert `response.headers.location` is `undefined` to lock this in.
- **Grow semantics:** Re-posting the same product *increments* the existing line (Shopify/commercetools convention), not upserts. The "grows an existing line" test exists to guard against a future "replace" regression.
- **Scope vs. missing:** Two distinct 404 cases are tested—`MISSING_ID` (no row) vs. a real row with `active: false` (scope refusal). Both must return the same 404 shape.
- **Computed view:** The file's module comment explicitly warns that `CartResponse` is derived at read time; a fixture would assert a shape the app never produces.
- **`@tests/contract` is a side-effect import** (no named bindings); it likely registers global matchers or interceptors that other tests in the suite depend on.
