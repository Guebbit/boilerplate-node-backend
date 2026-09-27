---
source: src/modules/orders/tests/integration/service-crud.test.ts
sha256: 749875f80636fbf0c771a8ddfe79bee1ce1f2c3502007595eceee1e779debbfd
generated_at: 2026-09-27T15:19:39.871161+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose

Integration tests for the **write** half of the order CRUD service (`create`, `update`, `updateById`, `remove`, `removeById`, `restoreById`). The read/aggregation half (`search`) is covered in a sibling `service-search.test.ts`. The suite exercises the service against a real test database while mocking only the external side-effects (mailer, invoice PDF rendering), and pins two load-bearing invariants: product snapshots are frozen at order time, and `scope` acts as a hard authorization boundary.

## Key elements

- **`seedOrder()`** — helper that creates a user, two products, and a two-line order via `create`, returning all four entities for assertions.
- **`describe('create', …)`** — the primary block. Covers 201 response, sequential invoice numbering (with a frozen clock), currency freezing, product snapshot integrity (including a "reprice later" regression), all-or-nothing creation (empty list → 422, missing product → 404, zero rows written), buyer-lookup failure fallback (greeting uses email), and stock-hold refusal (409, no row, no counter increment).
- **`describe('update' / 'updateById' / 'remove' / 'removeById' / 'restoreById', …)`** — (truncated in source) exercise mutation and deletion paths.
- **Mocks** — `enqueueEmail` (mailer adapter) and `renderInvoicePdf` (invoice service) are jest-mocked to avoid a Chromium launch and to let tests assert mail content independently.
- **`flush()`** — `setImmediate`-based helper that waits out `create`'s fire-and-forget placed-order email before asserting on `mockEnqueueEmail` calls.
- **`afterEach`** — restores all spies and resets timers (no-op unless `freezeDate` was used) to prevent clock leaks between tests.

## Relationships

- **`src/modules/orders/services/crud.ts`** — the module under test; all SUT functions are imported from `src/modules/orders/services/index.ts` which re-exports them.
- **`src/modules/orders/repository.ts`** — `orderRepository` is imported directly for post-conditions (re-reading rows, counting, spying on `create` / `incrementOrderNumberCounter`).
- **`src/modules/inventory/index.ts` / `service.ts`** — `inventoryService` is imported; stock-hold refusal and rollback tests depend on its `hold` / `release` contract.
- **`src/modules/users/index.ts` / `service.ts`** — `userService.getById` is spied on to simulate buyer-lookup failure; `createUser` factory seeds test users.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is mocked; tests assert template name, recipient, and greeting fallback.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is spied on to verify that both pricing and mail buyer-lookup failures are logged with expected messages.
- **`src/modules/orders/tests/factories.ts`** — provides `countOrders` for post-creation assertions.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct`, `saveProduct`, `countersOf` for product seeding and reprice simulation.
- **`tests/support/callers.ts`** — supplies `asCustomer`, `asAdmin`, `testCallerContext` for scope/authorization test cases.
- **`src/modules/orders/services/scope.ts`** — `callerScope` is imported for scope-related assertions.

## Notes

- **Mocked PDF rendering is intentional.** A real `renderInvoicePdf` call launches Chromium; the suite mocks it and relies on a dedicated invoice suite for render correctness. Everything else in the invoice module stays real.
- **`flush()` is mandatory** before asserting on `mockEnqueueEmail` in any test that exercises the placed-order email path; the email is enqueued via a fire-and-forget `Promise` that is not awaited by `create`.
- **Invoice-number tests freeze the clock** (`freezeDate`) to avoid a UTC year boundary splitting the sequential counter across two yearly sequences. `afterEach` resets timers as a safety net.
- **All-or-nothing creation** is explicitly tested: a single missing product must result in zero orders persisted and zero counter increments. A regression here would produce phantom orders.
- **The product-snapshot invariant** (embedding title + price on the order line) is tested both positively (snapshot exists) and negatively (reprice the product, reload the order, assert the old price persists). This is the core reason the schema embeds rather than references.
