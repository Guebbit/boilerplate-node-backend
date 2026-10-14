---
source: src/modules/cart/tests/integration/merge.test.ts
sha256: a125d94a9ca61348719ccaa3690df720b8dabaaaec5d73b2293196fb3861addd
generated_at: 2026-10-14T15:16:56.317766+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/merge.test.ts

## Purpose

Integration test suite for `cartMerge` — the operation that folds a guest cart into a signed-in user's cart. Verifies the line-by-line response contract (summed, capped, removed, flagged), confirms stock availability is reported without mutating quantities, and asserts that a `CART_MERGE_REFUSED` domain event fires for lines that could not be added. Every test reads the cart back via `cartGet` rather than trusting the merge response to self-describe.

## Key elements

- **`quantities(userId)`** — helper that calls `cartGet` and returns a `{ productId → quantity }` map for assertions on final cart state.
- **`lineOf(product, quantity)`** — helper that builds a single guest-line object (`{ productId, quantity }`) for merge input.
- **`describe('answers one result per submitted line')`** — covers: new line added; summed with existing; capped at the 999 ceiling; request-order preservation; duplicate-product lines answered sequentially; merged cart returned alongside.
- **`describe('stock flags a line and never changes it')`** — covers: short line added in full with `insufficient_stock`; exact-fit not flagged; summed quantity checked against on-hand; existing over-stock line never lowered; sold-out product added with `out_of_stock` (not `removed`); capped-and-short keeps the `capped` reason; checkout holds from another shopper reduce sellable quantity.
- **`announced` (jest.fn)** — subscribed to `CART_MERGE_REFUSED` in `beforeEach` to assert the refusal event is emitted with the correct payload.
- **`beforeEach` / `afterEach`** — override `NODE_CART_LINE_MAX` to `'999'` so the ceiling test is deterministic, then reset overrides after each case.

## Relationships

- **`src/modules/cart/services/index.ts`** — imports `cartMerge`, `cartGet`, `cartItemAddById`, `orderConfirm`; these are the SUT and its fixtures.
- **`src/modules/cart/services/merge.ts`** — the implementation under test (re-exported through `services/index`).
- **`src/modules/cart/events.ts`** — imports the `CART_MERGE_REFUSED` event constant for subscription and assertion.
- **`src/modules/cart/repository.ts`** — imports `cartRepository` to set a shipping method before confirming an order (checkout-hold scenario).
- **`src/kernel/events.ts`** — imports `onDomainEvent` / `resetDomainEvents` to subscribe to and clear domain-event listeners between tests.
- **`src/infrastructure/config/store.ts`** — imports `overrideEnvironment` / `resetEnvironmentOverrides` to pin the line-max ceiling per test.
- **`src/modules/products/index.ts`** — imports `productService` (calls `removeById` to simulate a removed product) and, via factories, `createProduct`.
- **`src/modules/inventory/index.ts`** — imports `inventoryService` (calls `adjust` to reduce on-hand stock mid-test).
- **`src/modules/payments/module.ts`** — imports `paymentsModule` to register a real payment handler so `orderConfirm` can complete and create a stock hold.
- **`src/modules/addresses/tests/factories.ts`** — imports `giveAddress` to satisfy checkout's address prerequisite.

## Notes

- The 999 ceiling is not a hard-coded constant in the test; it is set via `overrideEnvironment({ NODE_CART_LINE_MAX: '999' })` in `beforeEach`. If the shop's default is lower, the "capped" test would behave differently without this override.
- The "hold another shopper's checkout put on the shelf" test runs a full `orderConfirm` (with `paymentsModule` registered) to create a real inventory hold, then asserts that `cartMerge` for a second user sees the reduced sellable quantity. This makes the test order-dependent within the `describe` block and requires `resetDomainEvents()` between the confirm and the merge calls.
- The file is truncated in the provided content; the "hold" scenario and any further sub-suites beyond it are not visible.
