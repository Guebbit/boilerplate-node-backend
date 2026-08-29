# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/orders` HTTP surface. They assert that every response (success and error) satisfies the OpenAPI spec via `toSatisfyApiSpec()`, and that role-specific code paths (admin `findById` vs. scoped aggregate) return the *same* shape. The file exists because prior unit tests never crossed HTTP, leaving two production bugs undetected: the list endpoint emitting `totalItems`/`totalQuantity`/`totalPrice` where the spec demanded a single `total`, and `GET /orders/{id}` returning different bodies depending on caller role.

## Key elements

- **`seedOrderFor(user)`** – local helper; creates a product and a single-item order (qty 2) for the given user, returning the order doc.
- **`describe('GET /orders — the filters it now publishes')`** – verifies `?status=` and `?notes=` query parameters narrow results correctly. Status is set via `orderRepository.updateStatusIfIn` (transition, not raw column write).
- **`describe('GET /orders')`** – four tests: admin list, non-admin scoped list, unauthenticated 401, and an assertion that the body carries the three separate totals (`totalItems`, `totalQuantity`, `totalPrice`) and **not** a collapsed `total`.
- **`describe('GET /orders/{id}')`** – admin-path contract, non-admin-path contract, per-role 404 on malformed ID (`not-an-id`), and the same 404 on the `/invoice` sub-route.
- **`describe('POST /orders/{id}/cancel')`** – owner cancel, admin cancel of another user's order, stranger gets 404 (no existence leak), 409 `ORDER_NOT_CANCELLABLE` for non-pending, idempotency (second cancel → 409), unauthenticated 401.

## Relationships

- **`tests/support/contract.ts`** – side-effect import (`import '@tests/contract'`) that registers the `toSatisfyApiSpec()` matcher used in nearly every assertion.
- **`tests/support/http.ts`** – provides `api()` (supertest-style HTTP client) and `authenticateAs(role)` (returns bearer token + user doc).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` called once at module level to create/tear down an in-memory database.
- **`src/modules/orders/tests/factory.ts`** – `createOrder` and `toOrderItem` build seed data.
- **`src/modules/products/tests/factory.ts`** – `createProduct` supplies the product referenced by order items.
- **`src/modules/users/tests/factory.ts`** – `createUser` (used for the "stranger" negative test) and `PLAIN_PASSWORD` constant.
- **`src/modules/orders/index.ts`** – exports `orderRepository`, used directly to drive status transitions (`updateStatusIfIn`) without going through HTTP.

## Notes

- Every assertion pair is `expect(status).toBe(N); expect(response).toSatisfyApiSpec();` — the spec check is the authoritative assertion; the status check is a fast-fail guard.
- The malformed-ID test is **per role** (`it.each`) because the admin path (Mongoose `CastError` → 404) and the scoped aggregate path (driver `BSONError` → historically 422) hit different error-mapping code. A single-role test would miss a regression in the other branch.
- Status transitions are performed via `orderRepository.updateStatusIfIn(id, ['pending'], target)` rather than setting the column directly, so the test exercises the same guard the application uses.
- The `notes` filter test is admin-only by design: notes are staff-written metadata invisible to regular users.
