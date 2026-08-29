# src/modules/orders/tests/integration/cancel.test.ts

## Purpose

Integration tests for `orderService.cancelById` and `orderService.withActions`. They verify the cancellation invariants (atomic status gate + scope in one statement), the 404-vs-409 refusal contract, refund semantics enforced by role, the audit/analytics emissions, and the action-availability surface — all against a real test database.

## Key elements

- **`seedOrder(user)`** — local helper that creates a product via factory and a single-item pending order for the given user.
- **`asUser(user)`** — shorthand for a non-admin caller scope (`{ id, admin: false }`).
- **`describe('cancelById')`** — six cases: owner cancels pending; stranger gets 404 (order unchanged); shipped order gets 409 with `ORDER_NOT_CANCELLABLE` code; admin cancels non-owned order; operator cancels `processing` (customer cannot); soft-deleted order returns 404.
- **`describe('cancelById — who gets their money back')`** — subscribes to `ORDER_CANCELLED` domain events to assert the `refund` flag: forced `true` for customers, honours `false` for admins, defaults to `true`, and always emits the event regardless of refund.
- **`describe('cancelById — audit and analytics')`** — asserts audit action (`ORDER_CANCELLED`), `actor_role`/`actor_user_id` distinction between customer and system-triggered (reservation timeout) cancels, and that the analytics event is `ORDER_CANCELLED` vs `ORDER_RESERVATION_EXPIRED` depending on context.
- **`describe('withActions')`** — verifies `actions.transitions`/`cancel`/`pay` flags per status and role, confirms `paid` never appears, and that the returned body is the serialized order (not the raw document).
- **Port mocks** — `audit` and `analytics` infrastructure ports are replaced via `jest.mock` (spreading `requireActual` and overriding the emit function).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/service.ts` | Calls `cancelById` and `withActions` under test. |
| `src/modules/orders/repository.ts` | Reads back state via `findById`; mutates status via `updateStatusIfIn` to set up shipped/processing/soft-deleted fixtures. |
| `src/modules/orders/index.ts` | Exports `orderRepository` and the `ORDER_CANCELLED` event constant used in event assertions. |
| `src/modules/orders/audit.ts` | Imports `ordersAuditActions` for expected audit action strings. |
| `src/modules/orders/analytics.ts` | Imports `ordersAnalyticsEvents` for expected analytics event names. |
| `src/infrastructure/observability/audit.ts` | Mocked; `emitAuditEvent` called and asserted on. |
| `src/infrastructure/observability/analytics/index.ts` | Mocked; `emitAnalyticsEvent` called and asserted on. |
| `src/kernel/events.ts` | Uses `onDomainEvent` / `resetDomainEvents` to capture `ORDER_CANCELLED` payloads. |
| `src/modules/orders/tests/factory.ts` | `createOrder`, `toOrderItem` for fixture setup. |
| `src/modules/products/tests/factory.ts` | `createProduct` for fixture setup. |
| `src/modules/users/tests/factory.ts` | `createUser` for fixture setup. |
| `tests/support/caller-context.ts` | Provides `testCallerContext` passed to `cancelById` in the audit test. |
| `tests/support/ports.ts` | Provides `observePort` to turn the mocked port functions into jest spies for assertions. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory DB before the suite. |

## Notes

- **Port replacement, not spying.** The audit and analytics ports are swapped with `jest.mock` + `requireActual` spread rather than `jest.spyOn`. The CommonJS namespace getter is non-configurable, so `jest.spyOn` fails under the SWC transform used by `jest.config.mutation.js` and inside Stryker's sandbox. See `tests/support/ports.ts` for the full rationale.
- **Refund is role-gated, not caller-controlled.** Passing `{ refund: false }` as a customer is silently overridden to `true`; only an `admin` caller can suppress the refund. The test encodes this as a contract, not a bug.
- **Analytics event name depends on context.** A customer-initiated cancel emits `ORDER_CANCELLED`; a system-triggered reservation timeout emits `ORDER_RESERVATION_EXPIRED`. Both use the same underlying `cancelById` code path — the distinction is made by the presence/absence of `CallerContext`.
- **`afterEach` uses `jest.restoreAllMocks()`**, which resets the mocked port functions between tests; the domain-event subscription is cleaned up separately via `resetDomainEvents()`.
