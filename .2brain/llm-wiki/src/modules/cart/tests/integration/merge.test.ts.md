---
source: src/modules/cart/tests/integration/merge.test.ts
sha256: 7ee3f3ca943def1cab6795db7d1b65e34b13a7340f161804a10e40ce8ee195c6
generated_at: 2026-10-29T03:28:40.884727+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/merge.test.ts

## Purpose

Integration test suite for the guest-to-signed-in cart merge operation (`cartService.merge`). It verifies the merge contract line-by-line: quantities sum, the 999-per-line ceiling caps (never truncates), stock only *flags* a line (`insufficient_stock`, `out_of_stock`) without altering its quantity, removed products are answered with `availability: 'removed'`, and the `CART_MERGE_REFUSED` domain event fires when a line cannot be added at all. Every assertion reads the cart back via `cartService.get` rather than trusting the response alone.

## Key elements

- **`setupTestDb()`** — initialises the in-memory test database before any tests run.
- **`beforeEach` / `afterEach`** — override `NODE_CART_LINE_MAX` to `'999'` so the ceiling is deterministic, then reset environment overrides.
- **`quantities(userId)`** — helper that fetches the cart and returns a `productId → quantity` map for post-condition assertions.
- **`lineOf(product, quantity)`** — builds a single guest merge line (`{ productId, quantity }`).
- **`announced` (jest.fn.)** — spy registered on `CART_MERGE_REFUSED` via `onDomainEvent`; reset before each test.
- **`describe('answers one result per submitted line')`** — covers new-line, summed, capped, ordering, duplicate-product, and merged-cart-in-response cases.
- **`describe('stock flags a line and never changes it')`** — covers insufficient stock (added in full, flagged), exact-fit (no flag), summed-over-stock, existing-above-stock, sold-out, capped-and-short, and cross-shopper inventory holds.

## Relationships

- **`src/modules/cart/services/index.ts`** — the system under test; calls `cartService.merge`, `cartService.addItemById`, and `cartService.get`.
- **`src/modules/cart/events.ts`** — imports the `CART_MERGE_REFUSED` event constant to subscribe the spy.
- **`src/modules/cart/repository.ts`** — calls `cartRepository.setShippingMethod` to set up a checkout state for the inventory-hold test.
- **`src/infrastructure/config/store.ts`** — uses `overrideEnvironment` / `resetEnvironmentOverrides` to control `NODE_CART_LINE_MAX`.
- **`src/kernel/events.ts`** — uses `onDomainEvent` / `resetDomainEvents` for event spying.
- **`src/modules/products/tests/factories.ts`** — `createProduct` with configurable `onHand`.
- **`src/modules/users/tests/factories.ts`** — `createUser` to provision test accounts.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` to satisfy checkout prerequisites.
- **`src/modules/inventory/index.ts`** (re-exports from `services/index.ts`) — `inventoryService.adjust` to simulate stocktake movements.
- **`src/modules/products/index.ts`** (re-exports `productService`) — `productService.removeById` to create a removed-product scenario.
- **`src/modules/payments/module.ts`** — imported (via `registerCheckoutModules`) to register the payments module needed by the delivery/checkout flow.
- **`tests/support/callers.ts`** — supplies `testCallerContext` for all service calls.

## Notes

- The test deliberately lifts the per-line ceiling to 999 (`NODE_CART_LINE_MAX`) because the shop default is lower; the "capped" assertions are only meaningful at 999.
- `reason` is `undefined` for a brand-new line (no sum, no cap) — only `'summed'` and `'capped'` appear; stock state is carried separately in `availability`.
- A sold-out product (`onHand: 0`) is added and flagged `out_of_stock`, **not** answered as `removed`. Only a product deleted via `productService.removeById` yields `removed`.
- The "counts a hold another shopper's checkout put on the shelf" test exercises cross-user inventory state by driving a second user through `addItemById` + `setShippingMethod`, then asserting the first user's merge sees the reduced stock.
