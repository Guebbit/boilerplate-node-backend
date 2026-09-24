---
source: src/modules/orders/tests/integration/cancel.test.ts
sha256: 69ac3ea79e8b8435e485e0e8e9eeb0e8e98c923e2a8bac425e5d095fa016b5dd
generated_at: 2026-09-23T19:10:04.212710+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/cancel.test.ts

## Purpose

Integration tests for `orderService.cancelById`. Verifies the status-gate invariant (only `pending`/`processing` orders are cancellable), the scope gate (a stranger's order is indistinguishable from a missing one), the refund semantics per role, and that cancellation emits the correct domain event, audit entry, and analytics signal — all against a real test database.

## Key elements

- **`seedOrder(user)`** — creates a product and a single-item order owned by `user`; returns the persisted order.
- **`describe('cancelById')`** — core permission/status tests: owner cancel, stranger 404, shipped 409 with `ORDER_NOT_CANCELLABLE`, admin cancels foreign order, operator-only `processing → cancelled` edge, soft-deleted 404.
- **`describe('cancelById — who gets their money back')`** — pins refund behaviour: customer refund is forced (`refund: false` is ignored), operator/moderator may opt out, default is `true`; the `ORDER_CANCELLED` event fires regardless of refund.
- **`describe('cancelById — audit and analytics')`** — asserts audit action/outcome/actor fields and that a no-context (system) cancellation is audited as `actor_user_id: 'system'` and reports `ORDER_RESERVATION_EXPIRED` in analytics rather than `ORDER_CANCELLED`.
- **`jest.mock` for `@infrastructure/adapters/mailer`** — replaces `enqueueEmail` with a stub; email _content_ is pinned elsewhere (`mail-copy.test.ts`).
- **`jest.mock` for audit & analytics ports** — full module replacement (not `jest.spyOn`) to work around CommonJS non-configurable getters under SWC/Stryker; the audit mock re-routes `recordAudit` through the replaced `emitAuditEvent` so `observePort` sees both direct and indirect calls.
- **`cancellations` array + `onDomainEvent(ORDER_CANCELLED, …)`** — captures the domain-event payload for refund assertions; cleaned up via `resetDomainEvents()` in `afterEach`.

## Relationships

- **`src/modules/orders/services/index.ts`** — the system under test; every assertion targets the return shape and side-effects of `orderService.cancelById`.
- **`src/modules/orders/repository.ts`** — used to read back persisted state (`findById`), force status transitions (`updateStatusIfIn`), and apply soft-delete (`save`).
- **`src/modules/orders/events.ts`** — supplies the `ORDER_CANCELLED` event constant used in subscription and assertion.
- **`src/modules/orders/audit.ts` / `analytics.ts`** — export `ordersAuditActions` / `ordersAnalyticsEvents` used as expected values in port-call assertions.
- **`src/kernel/events.ts`** — `onDomainEvent` / `resetDomainEvents` lifecycle for event-capture tests.
- **`src/infrastructure/adapters/mailer.ts`** — mocked to isolate the queue from the test.
- **`src/infrastructure/observability/audit.ts` / `analytics/index.ts`** — replaced wholesale so `observePort` (from `tests/support/ports.ts`) can intercept emitted events.
- **`tests/support/callers.ts`** — `asCustomer`, `asAdmin`, `asModerator`, `testCallerContext` build the caller scopes passed to the service.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions the in-memory DB before the suite.
- **`tests/support/ports.ts`** — `observePort` wraps a replaced port function to produce a callable spy without `jest.spyOn`.
- **Module factories** (`users`, `products`, `orders`) — seed realistic entities without hand-rolling Mongoose docs.

## Notes

- The audit and analytics ports are **replaced** (`jest.mock`), not spied on. `jest.spyOn` fails on the non-configurable getter that a CommonJS namespace import exposes under the SWC transform and Stryker's sandbox. See `tests/support/ports.ts` for the full rationale.
- The audit mock explicitly re-wires `recordAudit` because that function closes over its own module's real `emitAuditEvent`; without the redirect, spies on the replaced `emitAuditEvent` would miss calls that go through `recordAudit`.
- The `processing → cancelled` transition test is the **only** path that exercises that edge end-to-end; `update()` elsewhere refuses to run it, so removing this test would leave the transition untested.
- Refund semantics are role-locked: the test "refunds a customer whatever they ask for" pins that a customer's `refund: false` is silently overridden to `true` — this is intentional domain behaviour, not a test artifact.
