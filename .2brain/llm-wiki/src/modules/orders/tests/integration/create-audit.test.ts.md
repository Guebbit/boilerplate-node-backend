---
source: src/modules/orders/tests/integration/create-audit.test.ts
sha256: e2e97e07fd66fcc0793ea78cfb3cbeb2fb9cfea3a050d50fc26ed97eaae3dabc
generated_at: 2026-10-29T04:52:14.681050+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/create-audit.test.ts

## Purpose

Integration test verifying that `orderService.create` writes an `order_created` audit row whose `actorRoleName` always reflects the **real** caller's role. It guards against a regression where the checkout path could silently overwrite the role label (e.g., forcing every purchase to read as "a customer action").

## Key elements

- **`contextAs(role, id?)`** — local helper that assembles a `CallerContext` with a named `actorRoleName`, a `callerAs` identity, and `analyticsConsent: false`. Simulates what a resolved HTTP request would produce.
- **`describe` block** — *"create — the audit row records the real caller, never a forced label"*; contains two cases:
  - Moderator places an order → audit row carries `actorRoleName: 'moderator'`.
  - Admin places an order → audit row carries `actorRoleName: 'admin'` (not silently downgraded to "customer").
- **`jest.mock('@infrastructure/observability/audit', …)`** — **replaces** the module with `auditPortMock()` from `@tests/ports` (not a `spyOn`, because the CJS namespace getter is non-configurable).
- **`jest.mock('@infrastructure/observability/analytics', …)`** — stubs `emitAnalyticsEvent` to a no-op `jest.fn()` while preserving the rest of the module.
- **`observePort(auditPort.emitAuditEvent)`** — returns a spy handle to assert on the single `emitAuditEvent` call after each `create` invocation.
- **`setupTestDb()`** — seeds the in-memory test database before the suite runs.

## Relationships

- **`src/modules/orders/services/index.ts`** — `orderService.create` is the system under test; called with buyer ID, email, line items, and a `CallerContext`.
- **`src/modules/orders/audit.ts`** — exports `ordersAuditActions.ORDER_CREATED`, asserted in every expectation.
- **`src/infrastructure/observability/audit.ts`** — fully mocked out; its `emitAuditEvent` is the function under observation.
- **`tests/support/ports.ts`** — provides `auditPortMock()` (used in the `jest.mock` factory) and `observePort` (returns the call spy).
- **`tests/support/callers.ts`** — `callerAs(role, id)` builds the identity portion of `CallerContext`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the shared test database.
- **`src/modules/users/tests/factories.ts`** — `createUser()` creates the buyer record.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` creates the line-item product.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — `CallerContext` type imported for the helper's return annotation.

## Notes

- The audit port is **replaced** via `jest.mock`, not wrapped with `jest.spyOn`. A comment in-file explains that `jest.spyOn` cannot redefine the non-configurable getter exposed by a CommonJS namespace import; see `cancel.test.ts` for the full rationale.
- The analytics mock preserves all real exports (`jest.requireActual`) and only overrides `emitAnalyticsEvent`, so other analytics side-effects in the create path are not accidentally suppressed.
- `afterEach(jest.restoreAllMocks)` is present even though the primary mocks are module-level; it covers any per-test spies introduced by `observePort`.
