---
source: src/modules/orders/tests/integration/cancel.test.ts
sha256: 5eb45ad8bdb96292ac2df90dbb4d08c35107e00b7bfe17b57275cb31e4962465
generated_at: 2026-09-27T15:17:18.533366+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/cancel.test.ts

## Purpose
Integration tests for `orderService.cancelById`. Verifies the status gate, permission scoping, refund semantics, and observability side-effects (audit, analytics, email, domain events) that make the single cancel operation safe to expose to callers.

## Key elements

- **`describe('cancelById')`** — Core permission/status matrix: owner cancels pending, stranger gets 404 (indistinguishable from absence), shipped order gets 409 with code `ORDER_NOT_CANCELLABLE`, admin bypasses ownership, `processing → cancelled` is admin-only, system actor (`SYSTEM_ACTOR`) cannot cancel a `paid` order (closes B21 race), soft-deleted order is 404.
- **`describe('cancelById — who gets their money back')`** — Refund semantics: customer refund is forced to `true` regardless of caller's `refund: false` request; admin and moderator may waive; event always fires with the actual refund flag.
- **`describe('cancelById — audit and analytics')`** — Asserts that `emitAuditEvent` and `emitAnalyticsEvent` are called with the correct action code, outcome, and actor role.
- **`seedOrder` / `seedDigitalOrder`** — Local helpers that create a product + order via the shared test factories.
- **`jest.mock` for mailer, audit, analytics** — Replaces ports (not spies) to work around CommonJS namespace-import constraints under Stryker/swc transforms. The audit mock re-routes `recordAudit` through the replaced `emitAuditEvent` so both direct and wrapped calls are observable.

## Relationships

- **`@modules/orders/services`** — SUT: `orderService.cancelById` is the only method under test.
- **`@modules/orders/repository`** — Used to force status transitions (`updateStatusIfIn`), read back stored state, and save soft-delete markers.
- **`@modules/orders/events`** — `ORDER_CANCELLED` subscription via `onDomainEvent` to capture event payloads.
- **`@kernel/events`** — `onDomainEvent` / `resetDomainEvents` lifecycle around refund tests.
- **`@kernel/permissions`** — `SYSTEM_ACTOR` constant for the B21 race test.
- **`@infrastructure/adapters/mailer`** — Mocked (`enqueueEmail`); email content is pinned separately in `mail-copy.test.ts`.
- **`@infrastructure/observability/audit`** / **`analytics`** — Replaced ports; `ordersAuditActions` and `ordersAnalyticsEvents` supply expected action/event codes.
- **`@modules/orders/audit`** / **`analytics`** — Provide the action/event name constants asserted in observability tests.
- **`@modules/users`** (index + service) — `createUser` factory and `userService` used to seed actors with roles.
- **`@modules/orders/tests/factories`** — `createOrder`, `toOrderItem` for order fixtures.
- **`@modules/products/tests/factories`** — `createProduct` for product fixtures.
- **`@tests/ports`** — `observePort` helper to assert on the replaced port functions.
- **`@tests/callers`** — `asCustomer`, `asAdmin`, `asModerator`, `asWarehouse`, `testCallerContext` permission-scoped caller contexts.

## Notes

- The audit/analytics ports are **replaced** (full module mock) rather than spied on. `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes; this breaks under `jest.config.mutation.js` (swc) and Stryker's sandbox. See `tests/support/ports.ts` for the full rationale.
- The audit mock manually re-wires `recordAudit` to call the replaced `emitAuditEvent`, because `recordAudit` closes over its own module's real `emitAuditEvent` and would otherwise bypass the spy.
- `afterEach` calls `jest.restoreAllMocks()`; the mailer mock is a plain `jest.fn()` (restored), while audit/analytics are replaced per-test-file.
- Email content is intentionally **not** asserted here — that contract lives in `mail-copy.test.ts`. This file only confirms `enqueueEmail` was called.
- The B21 race test (system actor vs. paid order) exists because the system actor holds only the `pending → cancelled` edge, unlike admin's wider transition set; the test guards against a future permission broadening silently opening that path.
