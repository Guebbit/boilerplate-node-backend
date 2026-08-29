# src/modules/orders/tests/integration/service-crud.test.ts

## Purpose

Integration tests covering the write/CRUD operations of the orders service (`create`, `getById`, `update`, `updateById`, `remove`, `removeById`). These complement `orders.test.ts`, which handles the read/aggregation path (`search`). The file exists because mutation coverage showed the entire CRUD half as a block of uncovered mutants.

## Key elements

- **`seedOrder()`** — helper that creates a user, two products, and an order through the service; returns all entities for subsequent assertions.
- **`reload(order)`** — re-fetches an order from the repository so `update` operates on current persisted state.
- **`releaseHold(order)`** — calls `inventoryService.releaseForOrder` to free held stock before tests that mutate line items.
- **`asReject` / `asSuccess`** — type-narrowing casts for the discriminated-union response type from `@infrastructure/http/response`.
- **`describe('create')`** — verifies 201 status, product-snapshot embedding, snapshot immutability after repricing, line preservation, 422 on empty items, 404 on missing product, and all-or-nothing atomicity.
- **`describe('getById')`** — verifies bare-id lookup, undefined for missing/empty id, scope-matched and scope-mismatched authorization, the shape divergence between scoped (plain object with `id`) and unscoped (Mongoose doc with `_id`) return types, and computed totals on the scoped path.
- **`describe('update')`** — verifies allowed lifecycle transitions, refusal of cancellation via the status field (409 + `ORDER_CANCEL_VIA_CANCEL_ENDPOINT`), and refusal of illegal transitions (409 + `ORDER_TRANSITION_NOT_ALLOWED`).
- *(Truncated section likely covers `remove` / `removeById`.)*

## Relationships

- **`src/modules/orders/service.ts`** — the unit under test; all CRUD functions are imported and exercised directly.
- **`src/modules/orders/index.ts`** — provides `orderRepository` (used for seeding state, re-reading, and status pre-conditions) and the `OrderDocument` type.
- **`src/modules/orders/repository.ts`** — `orderRepository.findById` / `.count` / `.updateStatusIfIn` are called to set up or verify persisted state.
- **`src/modules/inventory/index.ts` / `service.ts`** — `inventoryService.releaseForOrder` is called by the `releaseHold` helper.
- **`src/modules/products/tests/factory.ts`** — `createProduct` seeds catalog entries.
- **`src/modules/products/repository.ts`** — `productRepository.save` is used to mutate a product after order creation (snapshot test).
- **`src/modules/users/tests/factory.ts`** — `createUser` seeds buyer and stranger accounts.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises an in-memory Mongoose connection before all tests.
- **`tests/support/caller-context.ts`** — `testCallerContext` supplies the operator/system caller scope to service calls.
- **`tests/support/stub.ts`** — `asStub` casts service return values for structural assertions (used in the shape-divergence test).
- **`src/infrastructure/http/response.ts`** — provides the `ResponseReject` / `ResponseSuccess` types used by the narrowing helpers.

## Notes

- **Shape divergence in `getById` (pinned, not endorsed):** the unscoped path returns a Mongoose document (`_id` present, `id` is a virtual); the scoped path returns a transformed plain object (`_id` absent, `id` present). The test documents this and flags it as a latent role-dependent bug for callers reading `_id`.
- **Product snapshot is the core invariant:** orders embed a full copy of the product at creation time. The "repricing" test is the only way to catch a regression to a reference-based model.
- **All-or-nothing creation:** a single missing product must leave zero documents in the collection; the test asserts `orderRepository.count({})` is 0.
- **Cancellation is not a status assignment:** `update` with `{ status: 'cancelled' }` must always be rejected (409) regardless of caller, because cancellation is a multi-step sequence (release stock + emit `ORDER_CANCELLED`), not a field write.
- **Lifecycle precondition for `update` tests:** the `pending → paid` transition is a `system`-only edge, so tests pre-set status to `paid` via `orderRepository.updateStatusIfIn` before exercising operator-level moves.
- **`MISSING_ID`** is a hardcoded, non-existent ObjectId used for not-found assertions rather than generating one per test.
