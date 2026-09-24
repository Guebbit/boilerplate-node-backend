---
source: src/modules/orders/tests/integration/service-crud.test.ts
sha256: 199380beeadd1f86f4432025ea818521917b93fe5b3058d1cae1664deba9fc21
generated_at: 2026-09-23T19:12:12.941902+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose

Integration tests for the **write** half of the order CRUD service (`create`, `getById`, `update`, `updateById`, `remove`, `removeById`). The read/aggregation half (`search`) is covered in `service-search.test.ts`. Two behaviors carry the most weight here: `create` embeds a full product snapshot (title, price) so later repricing cannot rewrite historical charges, and `getById`'s `scope` argument acts as an authorization boundary — a mismatched scope must return `undefined` with no leak that the order exists.

## Key elements

- **`seedOrder`** – helper that creates a user + two products, calls `create`, and returns the persisted order document alongside its fixtures.
- **`reload`** – re-reads an order via `orderRepository.findById` so `update` operates on current DB state rather than a stale in-memory reference.
- **`releaseHold`** – delegates to `inventoryService.releaseForOrder` to return held stock before an items-rewrite test can proceed.
- **`deleteCachedInvoiceMock`** – a Jest mock that replaces `deleteCachedInvoice` (the only call into `services/invoice.ts`). Under `NODE_ENV=test` the cache TTL is forced to 0 so no real cache file is ever written; the mock simply records the call.
- **`describe('create')`** – verifies 201 response, sequential invoice numbering (`YEAR-SEQ`), product-snapshot embedding, snapshot immutability after `saveProduct`, one-line-per-item, 422 on empty items, 404 on missing product, and all-or-nothing (no partial order persisted).
- **`describe('getById')`** – covers bare-id lookup, missing/empty id, scoped (matching & mismatched) lookups, the `_id` vs `id` shape divergence between scoped (plain object) and unscoped (Mongoose document) paths, and computed totals on the scoped path.
- **`describe('update')`** – validates allowed lifecycle transitions, and pins the rule that cancellation must go through the dedicated cancel endpoint (not a bare status assignment), returning 409 with `ORDER_CANCEL_VIA_CANCEL_ENDPOINT`.

## Relationships

- **`src/modules/orders/services/crud.ts`** – the module under test; all six write operations are imported and exercised here.
- **`src/modules/orders/services/index.ts`** – barrel re-export; the test imports the public API surface (`getById`, `create`, `update`, `updateById`, `remove`, `removeById`, `search`, `callerScope`, `orderService`) from here rather than reaching into `crud.ts` directly.
- **`src/modules/orders/services/scope.ts`** – the scope/authorization logic that the `getById` scoped tests exercise (matching owner vs. stranger).
- **`src/modules/orders/repository.ts`** – used by `reload` and by the all-or-nothing assertion (`orderRepository.count`); also used directly to set `paid` status before an `update` test.
- **`src/modules/orders/model.ts`** – provides the `OrderDocument` type for local helpers.
- **`src/modules/inventory/service.ts` (via `index.ts`)** – `releaseForOrder` is called to free stock holds before rewrite tests.
- **`src/modules/products/tests/factories.ts`** – `createProduct` / `saveProduct` seed and mutate fixture products.
- **`src/modules/users/tests/factories.ts`** – `createUser` seeds fixture users (owner, stranger, buyer).
- **`tests/support/callers.ts`** – `testCallerContext`, `asCustomer`, `asAdmin` supply caller/permission context for service calls.
- **`tests/support/response.ts`** – `asSuccess` / `asReject` unwrap the service's `Result` type for assertions.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory (or temp) MongoDB instance for the suite.
- **`tests/support/stub.ts`** – `asStub` casts a value into a loosely-typed object for shape assertions (the scoped/unscoped shape test).

## Notes

- **Scoped vs. unscoped `getById` return different shapes.** Unscoped returns a Mongoose document keyed by `_id`; scoped returns a transformed plain object keyed by `id`. Because Mongoose exposes a virtual `id`, both branches resolve `order.id`, making the divergence easy to miss. The test explicitly asserts `_id` is `undefined` on the scoped path.
- **Cancellation is intentionally NOT a field assignment.** `update({ status: 'cancelled' })` is rejected with 409 (`ORDER_CANCEL_VIA_CANCEL_ENDPOINT`) because cancellation is a multi-step sequence (release stock, emit `ORDER_CANCELLED`, trigger payment refund) that a bare status write would skip.
- **`deleteCachedInvoice` is the sole mock in the file.** Everything else (repository, inventory, product lookups) runs against the real test database. The mock exists only because the invoice-cache write is untestable in-process (TTL forced to 0) and the test needs to assert the call was made.
- **The test file is truncated in the source snapshot**; the `update`, `updateById`, `remove`, and `removeById` suites are present but not fully visible here. The documented behaviors above cover only what is visible.
