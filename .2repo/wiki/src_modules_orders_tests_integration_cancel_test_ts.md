# src/modules/orders/tests/integration/cancel.test.ts

## Purpose

Integration tests for `orderService.cancelById` (and the related `withActions` projection) against a real database. They pin down the invariants that make the single-statement cancel safe: the status gate and ownership check are atomic, refusal reasons map to distinct HTTP statuses (404 vs 409), the refund flag is caller-scoped, and audit/analytics side-effects fire with the correct actor identity and event name.

## Key elements

- **`seedOrder(user)`** — creates a product and a one-item pending order for the given user.
- **`asUser(user)`** — returns a non-admin caller scope `{ id, admin: false }`.
- **`describe('cancelById')`** — ownership (404), status gate (409 for `shipped`), admin override, `processing → cancelled` restricted to admin, soft-deleted orders invisible to owner.
- **`describe('cancelById — who gets their money back')`** — subscribes to `ORDER_CANCELLED` via `onDomainEvent`; verifies customer refund is forced to `true`, admin can suppress refund, event is always emitted.
- **`describe('cancelById — audit and analytics')`** — asserts `emitAuditEvent` / `emitAnalyticsEvent` payload shape (action, outcome, actor_role, actor_user_id, event name), including the distinction between `ORDER_CANCELLED` and `ORDER_RESERVATION_EXPIRED`.
- **`describe('withActions')`** — verifies the action projection: which transitions are offered, `paid` is never in the list, and `actions` rides on the serialized wire shape (not the DB document).

## Relationships

| Neighbor | Interaction |
|---|---|
| `modules/orders/service.ts` | System under test: `cancelById`, `withActions` |
| `modules/orders/repository.ts` | `findById`, `updateStatusIfIn`, `save` for assertions and state manipulation |
| `modules/orders/index.ts` | Exports `ORDER_CANCELLED` event name |
| `modules/orders/audit.ts` | `ordersAuditActions` constants used in assertions |
| `modules/orders/analytics.ts` | `ordersAnalyticsEvents` constants used in assertions |
| `modules/orders/tests/fixtures.ts` | `createOrder`, `toOrderItem` for seeding |
| `modules/products/tests/fixtures.ts` | `createProduct` for order items |
| `modules/users/tests/fixtures.ts` | `createUser` for owner / stranger / admin accounts |
| `kernel/events.ts` | `onDomainEvent` / `resetDomainEvents` to capture emitted domain events |
| `infrastructure/observability/audit.ts` | Mocked; `emitAuditEvent` replaced with `jest.fn()` |
| `infrastructure/observability/analytics/index.ts` | Mocked; `emitAnalyticsEvent` replaced with `jest.fn()` |
| `tests/support/ports.ts` | `observePort` wraps the mocked functions for spy-style assertions |
| `tests/support/caller-context.ts` | `testCallerContext` passed to `cancelById` for audit-context tests |
| `tests/support/setup-test-db.ts` | `setupTestDb()` boots a real database for the test run |

## Notes

- **`jest.mock` instead of `jest.spyOn` for ports.** The audit and analytics modules are namespace imports whose getters are non-configurable under the SWC transform used by `jest.config.mutation.js` and Stryker's sandbox. `jest.spyOn` would throw; full-module `jest.mock` with `requireActual` spread is the working pattern. See `tests/support/ports.ts` for the rationale.
- **Refund is not caller-negotiable for customers.** The tests lock in that `cancelById` *forces* `refund: true` on the domain event when the caller is non-admin, even if the caller explicitly passes `{ refund: false }`. Only an admin scope can suppress it.
- **`withActions` operates on the serialized shape.** The last test (partially visible) asserts that `actions` is set on the wire-shaped object, not the Mongoose document, because the schema transform would strip unknown fields.
- **`afterEach(() => jest.restoreAllMocks())`** is present but the ports are replaced via `jest.mock` (module-level), so this primarily restores any incidental spies; the mock factories persist for the file's lifetime.
