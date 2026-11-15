---
source: src/modules/orders/tests/integration/service-crud.test.ts
sha256: b7acf68e4d4f8b9442111bfd6917905b6d83c403e353942a50c2ec74fb7c96c1
generated_at: 2026-11-14T20:54:49.191781+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose

Integration test suite covering the **write** half of the order service — `create`, `update`, `updateById`, `remove`, `removeById`. It exercises those operations against a real (test) database to verify business rules like product-snapshot pricing, stock reservation, scope-based authorization, sequential order numbers, and idempotent soft-delete. The read/aggregation half (`search`) is covered separately in `service-search.test.ts`.

## Key elements

- **`describe('create', …)`** — the bulk of the visible tests: 201 success, peer/self ordering, selling hidden/off-sale products, 409 for soft-deleted products, 404 for non-displayable products to customers, skipping the checkout open-order cap, and sequential order-number assignment (frozen clock).
- **`refusedLines(caller)`** — helper that places an order exceeding stock and extracts the `details.lines` array from the 409 response envelope.
- **`seedOrder()`** — creates a user + two products + a multi-line order via the service; returns the persisted order document for subsequent test steps.
- **`seedCanceledOrder()`** — wraps `seedOrder` and force-transitions the order to `canceled`, returning the re-read document.
- **`createWithLines(quantities)`** — creates a unique user and N well-stocked products, then calls `orderService.create` with one line per product.
- **`afterEach`** — restores all mocks and calls `jest.useRealTimers()` to guard against a leaked frozen clock.
- **`jest.mock('@infrastructure/adapters/mailer')`** — stubs `enqueueEmail` so tests never hit the mail queue.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/crud.ts` | Imports `update` (and, via the barrel, `orderService`) — the code under test. |
| `src/modules/orders/services/remove.ts` | Imports `remove` directly for the remove/removeById tests. |
| `src/modules/orders/services/index.ts` | Barrel re-export used to obtain `orderService`. |
| `src/modules/orders/repository.ts` | Imports `orderRepository` for direct-DB assertions on persisted state. |
| `src/modules/orders/tests/factories.ts` | `countOrders`, `createOrder`, `forceOrderStatus`, `toOrderItem` — DB-level helpers. |
| `src/modules/products/tests/factories.ts` | `createProduct`, `saveProduct`, `countersOf` — product fixtures and stock-counter assertions. |
| `src/modules/users/tests/factories.ts` | `createUser` — creates user records with specific roles/emails. |
| `src/modules/users/index.ts` | Imports `userService` (used in authorization/scope tests). |
| `src/types/index.ts` / `src/types/auth-context.ts` | `OrderStatus`, `CallerContext` — shared type contracts. |
| `tests/support/callers.ts` | `callerContextAs`, `asCustomer`, `asAdmin`, `testCallerContext` — builds the caller/role context passed to service calls. |
| `tests/support/clock.ts` | `freezeDate` — pins the system clock for order-number sequence tests. |
| `tests/support/environment.ts` | `withEnvironmentOverrides` — temporarily sets `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT` for cap tests. |

## Notes

- **Product snapshot, not reference.** `create` copies title/price into the order at write time. Repricing the product afterward must not alter what the customer was charged — the tests assert this by mutating the product post-create and re-reading the order.
- **Scope is an authorization boundary.** `getById` (and related reads) accept a `scope`/caller context; a mismatched scope must return `undefined`, not the order document. This is an auth check, not just a filter.
- **Order-number sequences are per-year.** Tests freeze the clock (`freezeDate`) to guarantee two orders land in the same yearly sequence, then assert the sequence parts differ by exactly one.
- **The open-order cap is a *checkout* rule.** It is deliberately skipped when an admin raises an order by hand; the test sets `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT=1` and still expects two successful creates.
- **Soft-deleted vs. hidden vs. off-sale are distinct.** A soft-deleted product is refused (409) to everyone. A hidden or off-sale product is sellable by an admin but returns 404 to a customer without `display:Product` (to avoid leaking existence). An off-sale product *is* public, so a customer can still buy it.
- **Mailer is mocked, not called.** The queue adapter is stubbed at the module level; any test that accidentally triggers a real email will fail silently via the mock.
- **`afterEach` unconditionally calls `jest.useRealTimers()`.** This is a safety net: if a test freezes the clock and then throws before cleanup, the timer freeze does not leak into the next test.
