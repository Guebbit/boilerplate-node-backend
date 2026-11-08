---
source: src/modules/orders/tests/integration/service-crud.test.ts
sha256: d155361c33280efea95f68f7444e8c17c196734bef13a8c38c9d4d25cde0705e
generated_at: 2026-11-08T07:09:33.013050+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose

Integration test suite for the **write half** of the order service (`create`, `update`, `updateById`, `remove`, `removeById`) and the authorization boundary of `getById`. It verifies two invariants that carry real weight: `create` stores a **product snapshot** (price, title) rather than a live reference so later repricing cannot rewrite the charge, and `getById`'s `scope` argument is an authorization boundary (mismatch → `undefined`, not the order). The read/aggregation path (`search`) lives in the sibling `service-search.test.ts`.

## Key elements

- **`seedOrder()`** — creates a user, two products, and an order through `orderService.create`; returns the persisted order document plus the created user/products.
- **`seedCanceledOrder()`** — wraps `seedOrder`, then forces the order to `canceled` via `forceOrderStatus` (from the order factories).
- **`createWithLines(quantities)`** — creates an order whose line count equals `quantities.length`, each backed by a fresh 100-stock product and a unique email (avoids the email-uniqueness constraint across repeated calls).
- **`refusedLines(caller)`** — orders 5 units of a 1-unit product, then extracts `details.lines` from the 409 envelope; used to assert per-line refusal detail.
- **`describe('create', …)`** — the primary block. Covers: 201 success; admin raising orders for self/peers; selling hidden or off-sale products by hand (stock still held); soft-deleted product refusal (409 `ORDER_PRODUCT_UNAVAILABLE`, no partial stock hold); 404 for hidden/soft-deleted products to a caller lacking `display:Product`; off-sale products still purchasable by a plain customer; bypass of the `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT` cap (a checkout rule, not an operator rule); and sequential order-number assignment (frozen clock, `YYYY`-`NN` format, two numbers one apart).
- **`afterEach`** — `jest.restoreAllMocks()` + `jest.useRealTimers()` as a safety net so a leaked `freezeDate` never escapes a failing assertion.
- **Jest mock** — `@infrastructure/adapters/mailer` is stubbed to `enqueueEmail: jest.fn()` ("the queue, not the copy"); no real email is sent.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/crud.ts` | Imports `update` directly (unit-level SUT for the update path). |
| `src/modules/orders/services/remove.ts` | Imports `remove` (SUT for the delete path). |
| `src/modules/orders/services/index.ts` | Imports `orderService` — the public facade used for most assertions (`create`, `getById`, etc.). |
| `src/modules/orders/repository.ts` | Imports `orderRepository` for direct persistence checks. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `countOrders`, `forceOrderStatus`, `toOrderItem`. |
| `src/modules/products/tests/factories.ts` | `createProduct`, `saveProduct`, `countersOf` (stock-reservation assertions). |
| `src/modules/users/tests/factories.ts` | `createUser` with role/e-mail overrides. |
| `src/modules/users/index.ts` / `src/modules/users/services/index.ts` | `userService` imported for user-service interactions. |
| `src/types/index.ts` / `src/types/auth-context.ts` | `OrderStatus`, `CallerContext` types. |
| `tests/support/callers.ts` | `asCustomer`, `asAdmin`, `callerAs`, `callerContextAs`, `testCallerContext` — build the `caller` / `scope` arguments passed to service methods. |
| `tests/support/clock.ts` | `freezeDate` to pin UTC time for order-number sequence tests. |
| `tests/support/environment.ts` | `withEnvironmentOverrides` to set `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT` for the cap-bypass case. |

## Notes

- **Product snapshot invariant** is the file's central concern: assertions check that a later `saveProduct` reprice does not change the price recorded in the order's `lines`.
- **Authorization ≠ availability.** A hidden (`active: false`) or soft-deleted product is *sellable* by an admin (hand-raised order, like Solidus/Shopify draft orders) but *invisible* to a caller without `display:Product` (404, not 409). An off-sale product (`purchasable: false`) is public and therefore still sellable even to a plain customer. The test matrix separates these three cases explicitly.
- **Open-order cap is a checkout guard.** An operator raising an order for a customer is not the shopper the cap exists to stop; the test asserts two orders succeed even with the cap set to 1.
- **Clock freezing** (`freezeDate`) is used only in the order-number test to prevent two orders from straddling a UTC year boundary (which would mint numbers from two different yearly sequences). The `afterEach` unconditionally calls `jest.useRealTimers()` to prevent a leaked freeze from contaminating other suites.
- The file is **truncated** in the source snapshot; the `describe('update', …)`, `describe('remove', …)`, and `describe('getById', …)` blocks referenced in the module doc-block are below the cut point.
