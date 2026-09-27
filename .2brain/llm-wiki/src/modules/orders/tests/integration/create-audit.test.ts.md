---
source: src/modules/orders/tests/integration/create-audit.test.ts
sha256: d0bd177e6c88bf80bc2ddd35dd4cd333c44abb0a014c3142f29f5fd58e966892
generated_at: 2026-09-27T15:17:30.706416+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/create-audit.test.ts

## Purpose

Integration test that verifies the `order_created` audit row always records the real caller's role name (e.g. `moderator`, `admin`) rather than silently forcing a fixed label like "customer." It guards against a regression where any code path in `create` could override `actor_role`/`actor_role_name`.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the audit port with a mock `emitAuditEvent` and re-routes `recordAudit` through that mock (because `recordAudit` closes over its own module-scoped `emitAuditEvent`).
- **`jest.mock('@infrastructure/observability/analytics', …)`** — Suppresses analytics side-effects during the test.
- **`setupTestDb()`** — Boots an in-memory database for the test run.
- **`contextAs(role, id?)`** — Local helper that builds a `CallerContext` with a named tenant role and a `caller` via `callerAs`.
- **`describe('create — the audit row records the real caller, never a forced label')`** — Contains two `it` blocks:
  - Moderator places an order → audit row must carry `actor_role_name: 'moderator'`.
  - Admin places an order → audit row must carry `actor_role_name: 'admin'`.

## Relationships

- **`src/modules/orders/services/crud.ts`** (via `services/index.ts`) — The `create` function under test.
- **`src/modules/orders/audit.ts`** — Provides `ordersAuditActions.ORDER_CREATED`, used in assertions.
- **`src/infrastructure/observability/audit.ts`** — The port being mocked; exposes `emitAuditEvent`, `recordAudit`, `buildAuditEvent`.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory for the buyer record.
- **`src/modules/products/tests/factories.ts`** — `createProduct` factory for the order line item.
- **`src/types/auth-context.ts`** (via `src/types/index.ts`) — `CallerContext` type used by `contextAs`.
- **`tests/support/callers.ts`** — `callerAs` helper that populates the `caller` field.
- **`tests/support/ports.ts`** — `observePort` wraps the mock to produce a Jest spy reference.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database.

## Notes

- The audit port is **replaced**, not spied on. A comment in the file (and in the sibling `cancel.test.ts`) explains that `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes.
- The mock re-routes `recordAudit` through the replacement `emitAuditEvent` because `recordAudit` captures its own module-scoped `emitAuditEvent`; without this, a spy on the port-level `emitAuditEvent` would miss every call that goes through `recordAudit`.
- `analyticsConsent` is always `false` in the test contexts to keep analytics silent.
