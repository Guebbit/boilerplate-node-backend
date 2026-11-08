---
source: src/modules/cart/tests/integration/merge.test.ts
sha256: 7ee3f3ca943def1cab6795db7d1b65e34b13a7340f161804a10e40ce8ee195c6
generated_at: 2026-11-08T05:21:39.095914+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/merge.test.ts

## Purpose

Integration tests for `cartService.merge` — the operation that folds a guest cart's lines into a signed-in user's existing cart. Verifies the line-by-line contract shared with `POST /cart`: quantities sum, results are per-line and in request order, stock only *flags* a line (never changes its quantity), the line-max ceiling caps but doesn't reject, and fully refused lines emit `CART_MERGE_REFUSED`.

## Key elements

- **`quantities(userId)`** — helper that reads the cart back via `cartService.get` and returns a `productId → quantity` map. Every assertion about what the cart *holds* goes through this, never trusting the merge response alone.
- **`lineOf(product, quantity)`** — shapes a guest line (`{ productId, quantity }`) from a product factory result.
- **`describe('answers one result per submitted line')`** — covers: new line added, summation (`reason: 'summed'`), ceiling cap (`reason: 'capped'`, result 999), request-order preservation, duplicate product lines (second sees first's result), and the `cart` field in the response.
- **`describe('stock flags a line and never changes it')`** — covers: short line added in full with `availability: 'insufficient_stock'`, exact-fit not flagged, summed quantity checked against stock, existing over-stock line never lowered, sold-out product flagged `out_of_stock` (not `removed`), capped + short combined, and checkout-hold quantities.
- **`announced` / `onDomainEvent(CART_MERGE_REFUSED, …)`** — spy on the refused event; reset in `beforeEach`.
- **`beforeEach` / `afterEach`** — override `NODE_CART_LINE_MAX` to `999` (contract ceiling) and restore environment afterwards.

## Relationships

- **`src/modules/cart/services/index.ts`** (`cartService`) — the system under test: `merge`, `get`, `addItemById`.
- **`src/modules/cart/repository.ts`** (`cartRepository`) — used to set shipping method when simulating a checkout hold.
- **`src/modules/cart/events.ts`** (`CART_MERGE_REFUSED`) — event constant subscribed to for spy assertions.
- **`src/kernel/events.ts`** (`onDomainEvent`, `resetDomainEvents`) — domain-event bus for spying and isolation.
- **`src/infrastructure/config/store.ts`** (`overrideEnvironment`, `resetEnvironmentOverrides`) — controls `NODE_CART_LINE_MAX` per test.
- **`src/modules/products/tests/factories.ts`** / **`src/modules/products`** (`productService`) — `createProduct` with configurable `onHand`; `removeById` for the removed-product case.
- **`src/modules/inventory`** (`inventoryService`) — `adjust` to simulate a stocktake reducing shelf quantity mid-test.
- **`src/modules/users/tests/factories.ts`** (`createUser`) — provisions test users.
- **`src/modules/addresses/tests/factories.ts`** (`giveAddress`) — provides a shipping address for the checkout-hold scenario.
- **`src/modules/payments/module.ts`** (`paymentsModule`) — registered as part of checkout module setup for hold-related tests.
- **`tests/support/callers.ts`** (`testCallerContext`) — caller identity passed to service calls.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — peer integration test sharing the same factory and `registerCheckoutModules` conventions.

## Notes

- The `NODE_CART_LINE_MAX` override is **essential**: the production default is lower than 999. Without it, the "capped" tests would cap at the shop default and assert the wrong numbers.
- Every test that asserts cart contents calls `quantities(userId)` (a separate `GET` round-trip) in addition to checking the merge response. This is a deliberate convention: the response describes the *operation*, the read-back proves the *state*.
- Stock never mutates a line's quantity — it only sets `availability`. A sold-out product is still added to the cart; it is flagged, not refused. Do not confuse `out_of_stock` (flag) with `removed` (refused).
- The file is truncated in the source shown; the `CART_MERGE_REFUSED` spy and `announced` mock are wired up but their assertion cases (likely a "refused" describe block) fall past the visible portion.
- `registerCheckoutModules` is imported from `@tests/checkout-modules` (not a listed graph neighbor but a shared test helper) and is presumably called in the checkout-hold scenario.
