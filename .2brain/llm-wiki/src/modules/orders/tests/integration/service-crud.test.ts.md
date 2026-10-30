---
source: src/modules/orders/tests/integration/service-crud.test.ts
sha256: 541ae95adb50024f711a43397d04291aac0f9acbda859de4cfe40002b3646d12
generated_at: 2026-10-29T04:56:39.098351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose

Integration test for the write-half of the Order service (`create`, `update`, `updateById`, `remove`, `removeById`). It exercises the real service layer against a test database to verify business rules that unit tests cannot: product-snapshot semantics at creation, the `scope` authorization boundary on reads, permission-gated product visibility, stock holds, sequential order-number minting, and the atomicity of multi-line creation failures. The read/aggregation half (`search`) is covered by a sibling `service-search.test.ts`.

## Key elements

- **`refusedLines(caller)`** – Helper that attempts a 5-unit order against a 1-unit product and extracts the `details.lines` array from the 409 response, typed loosely because the envelope widens `details`.
- **`seedOrder()`** – Creates a two-line order (Keyboard ×2, Mouse ×1) via `orderService.create` and returns the persisted document plus its user and products.
- **`seedCancelledOrder()`** – `seedOrder` + a forced status flip to `cancelled`, mirroring what `removeById` expects to read.
- **`createWithLines(quantities)`** – Generic helper: one fresh well-stocked product per quantity, all in a single `create` call. Useful for multi-line atomicity assertions.
- **`describe('create', …)`** – The main block, covering:
  - 201 happy-path with admin caller.
  - Operator creating for a peer, an equal, and themselves (no buyer rank in the body).
  - Selling hidden / off-sale products by hand (staff override), verifying stock hold.
  - Refusal of soft-deleted products (409 `ORDER_PRODUCT_UNAVAILABLE`, listing only the bad IDs, zero writes, zero holds on good lines).
  - 404 (not 409) for hidden/deleted products when the caller lacks `display:Product`, preventing information disclosure.
  - Off-sale products remain purchasable by a customer (public attribute).
  - Open-order cap (`NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`) is **not** applied to operator-raised orders.
  - Sequential order-number assignment within a frozen UTC date (year-seq format).
- **`afterEach`** – Restores all mocks and resets any frozen clock so a failed assertion cannot leak state.
- **Mailer mock** – `@infrastructure/adapters/mailer` is replaced with a no-op `enqueueEmail`; tests assert on the queue, not a copy.

## Relationships

- **`src/modules/orders/services/index.ts`** – Source of `orderService`, the primary object under test.
- **`src/modules/orders/services/crud.ts`** – Direct import of `update` (and, by extension, `create`, `updateById`, `getById`) for targeted assertions.
- **`src/modules/orders/services/remove.ts`** – Direct import of `remove` / `removeById`.
- **`src/modules/orders/repository.ts`** – `orderRepository` used for direct state verification (e.g., confirming no document was written).
- **`src/modules/orders/tests/factories.ts`** – `countOrders`, `createOrder`, `forceOrderStatus`, `toOrderItem`.
- **`src/modules/products/tests/factories.ts`** – `createProduct`, `saveProduct`, `countersOf` (stock reservation checks).
- **`src/modules/users/tests/factories.ts`** – `createUser` (with optional role).
- **`src/modules/users/index.ts`** – `userService` for user-state assertions.
- **`src/types/index.ts` / `src/types/auth-context.ts`** – `OrderStatus`, `CallerContext` types.
- **`tests/support/callers.ts`** – `asCustomer`, `asAdmin`, `callerAs`, `callerContextAs`, `testCallerContext` for constructing permissioned request contexts.
- **`tests/support/clock.ts`** – `freezeDate` to pin UTC for order-number sequence tests.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` to temporarily set `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`.

## Notes

- **Product snapshot, not reference.** A later repricing of a product must not alter the price stored in an existing order; the test asserts the snapshot is captured at creation time.
- **Scope is authorization, not filtering.** A mismatched `scope` on `getById` must return `undefined` (as if the order doesn't exist), not a 403—this is a deliberate design choice to avoid leaking existence.
- **404 vs 409 for unavailable products.** A caller without `display:Product` gets 404 for hidden/deleted products so the response cannot confirm the product's existence or leak its title/price. A caller *with* the permission gets a 409 with the specific `productIds` in `details`.
- **Off-sale ≠ hidden.** `purchasable: false` is a public attribute; even a plain customer can still buy. `active: false` (hidden) is not.
- **Open-order cap is checkout-scoped.** Operator-raised orders bypass `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`; the cap lives in the checkout service, not here.
- **Order numbers are year-partitioned sequences.** The test freezes the clock to a fixed UTC date to guarantee two orders fall in the same yearly sequence and are exactly one apart.
- **Mailer is mocked at the queue level.** Assertions target `enqueueEmail` calls (the queue), not any email-copy side-effect.
