# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose

Contract tests that assert every `/orders` HTTP response (list, single-fetch, cancel) satisfies the OpenAPI spec via `toSatisfyApiSpec()`. The file exists because the list endpoint historically returned `totalItems`/`totalQuantity`/`totalPrice` while the spec declared a single `total`, and `GET /orders/{id}` returned a different shape per caller role — neither was caught because no prior test exercised the HTTP boundary.

## Key elements

- **`seedOrderFor(user)`** — local helper; creates one product and one order (qty 2) for the given user.
- **`describe('GET /orders — the filters it now publishes')`** — verifies `?status=` and `?notes=` query params actually narrow results (these were unadvertised in the spec).
- **`describe('GET /orders')`** — contract checks for the list endpoint as admin, non-admin, unauthenticated (401), and explicit assertion that the three separate total fields exist and `total` does not.
- **`describe('GET /orders/{id}')`** — contract checks for both the admin (`findById`) and non-admin (scoped aggregate) code paths, plus 404 on malformed id for both roles and the `/invoice` sub-route.
- **`describe('POST /orders/{id}/cancel')`** — owner cancel, admin cancel, stranger gets 404 (no existence leak), non-cancellable order gets 409 with `ORDER_NOT_CANCELLABLE` code, double-cancel gets 409, unauthenticated gets 401.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported as `@tests/contract`; registers the `toSatisfyApiSpec()` matcher used on every assertion. |
| `tests/support/http.ts` | Provides `api()` (supertest wrapper) and `authenticateAs(role)` for request setup. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module scope to prepare a clean database before any test runs. |
| `src/modules/orders/index.ts` | Exports `orderRepository`, used directly to drive status transitions (`updateStatusIfIn`) that the API itself cannot perform. |
| `src/modules/orders/tests/fixtures.ts` | `createOrder` and `toOrderItem` seed order data. |
| `src/modules/products/tests/fixtures.ts` | `createProduct` seeds a product for each order. |
| `src/modules/users/tests/fixtures.ts` | `createUser` and `PLAIN_PASSWORD` create the "stranger" account for the existence-leak test. |

## Notes

- `setupTestDb()` runs at **module scope** (not inside `beforeAll`), so it executes exactly once when the file is loaded.
- Status transitions (pending → paid, pending → shipped) are performed via `orderRepository.updateStatusIfIn` rather than through HTTP, because the application has no public endpoint to set those states directly.
- The malformed-id test (`/orders/not-an-id`) historically exposed a 404-vs-422 discrepancy between admin and non-admin paths; `it.each` now pins both to 404.
- The "stranger" cancel test logs in through `/account/login` instead of using `authenticateAs`, because it needs a *different* user than the one who owns the order.
- `seedOrderFor` always uses quantity 2; tests that assert `totalQuantity` rely on that fixed value.
