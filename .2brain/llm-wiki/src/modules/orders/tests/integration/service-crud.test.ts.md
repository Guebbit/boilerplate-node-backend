---
source: src/modules/orders/tests/integration/service-crud.test.ts
sha256: 650cd3fdc76a11b9bd6c289f38ea6c50f8445bb77553883c0ad2915ee87c88b5
generated_at: 2026-10-15T11:17:25.262265+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose

Integration test suite for the **write half** of the orders service (`create`, `update`, `updateById`, `remove`, `removeById`, `getById`, `getForCaller`). It verifies the two invariants that carry real business weight: (1) `create` embeds a full product snapshot so later repricing cannot silently rewrite what a customer was charged, and (2) `getById`'s `scope` argument is an authorization boundary—a mismatched scope must return `undefined`, not the order. The read/aggregation half (`search`) is covered separately in `service-search.test.ts`.

## Key elements

- **`flush`** – `setImmediate`-based helper that waits out `create`'s fire-and-forget placed-order email (same convention as the cart checkout suite).
- **`refusedLines(caller)`** – Helper that places an over-quantity order against a 1-unit product and extracts the `details.lines` array from the 409 error envelope.
- **`seedOrder`** – Creates a realistic 2-line order (Keyboard ×2, Mouse ×1) via the service as an admin caller; returns the user, products, and persisted order doc.
- **`seedCancelledOrder`** – Wraps `seedOrder` then forces status to `cancelled` via `forceOrderStatus`.
- **`createWithLines(quantities)`** – Creates a fresh user (unique UUID email) and one well-stocked product per line, then calls `create`; used by the admin-line-limit tests.
- **`describe('create', …)`** – The bulk of the visible suite: 201 response shape, rank-rule (`OUTRANKED` 403), open-order-cap skip for admin-raised orders, sequential `orderNumber` (year-seq), currency frozen at creation, product snapshot fidelity, line preservation, empty-list 422, and `NODE_ADMIN_ORDER_MAX_LINES` enforcement.
- **`jest.mock` of `@infrastructure/adapters/mailer`** – Replaces `enqueueEmail` with a `jest.fn()` so tests assert on the queue, not the rendered copy (copy pinned in `mail-copy.test.ts`).
- **`afterEach`** – Restores all mocks and un-freezes timers defensively (no-op unless a case called `freezeDate`).

## Relationships

- **`src/modules/orders/services/crud.ts`** – Primary unit under test; all service functions are imported through the barrel.
- **`src/modules/orders/services/index.ts`** – Barrel re-export from which `getById`, `create`, `update`, `removeById`, `restoreById`, `callerScope`, etc. are destructured.
- **`src/modules/orders/repository.ts`** – `orderRepository.findById` is used to read back persisted documents and verify snapshot/currency persistence independent of the service layer.
- **`src/modules/orders/services/scope.ts`** – The authorization-boundary logic exercised by the `getById` scope-mismatch tests.
- **`src/modules/orders/tests/factories.ts`** – Provides `createOrder`, `forceOrderStatus`, `toOrderItem`, `countOrders` helpers.
- **`src/modules/products/tests/factories.ts`** – `createProduct`, `saveProduct`, `countersOf` for seeding and repricing products.
- **`src/modules/users/tests/factories.ts`** – `createUser` for seeding callers at various ranks.
- **`src/modules/users/index.ts`** – `userService` imported (likely for rank/identity lookups in authorization assertions).
- **`src/infrastructure/adapters/mailer.ts`** – Mocked; `enqueueEmail` replaced to isolate email side-effects.
- **`src/infrastructure/adapters/logger.ts`** – Imported for log-output assertions or spy setup.
- **`src/modules/orders/services/read.ts` / `remove.ts`** – Sibling service modules; `remove`/`removeById`/`restoreById` are part of the write half tested here, `read` is the separate search suite.

## Notes

- The mailer is **mocked at the module level**, not via dependency injection. Tests that need to assert on the queued email call `flush()` first, then inspect `mockEnqueueEmail.mock.calls`.
- `freezeDate` is used to pin `orderNumber` generation to a single UTC year so the "one-apart" sequence assertion is deterministic; `afterEach` un-freezes defensively to prevent timer leakage across tests.
- The open-order cap (`NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`) is a **checkout** rule, not a service rule—admin-raised orders intentionally bypass it. The test confirms this by setting the cap to 1 and still creating two orders.
- The rank rule is asymmetric: an admin may create an order for *themselves* but not for an *equal-rank* account (403 `OUTRANKED`). The "for oneself" case succeeds because the money-step services refuse downstream.
- Product snapshot assertions check both `title` and `price` on the embedded `item.product` object—catching a regression to a bare reference would be silent in production (historical orders would restate at current prices).
