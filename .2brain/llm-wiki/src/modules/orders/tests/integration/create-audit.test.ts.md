---
source: src/modules/orders/tests/integration/create-audit.test.ts
sha256: b1a3854589549160923d8fd6d80e03433ff7fc5f1e32ae68f67651b5668212f8
generated_at: 2026-10-15T11:13:39.287694+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/create-audit.test.ts

## Purpose

Integration test enforcing a single invariant on the order-creation path: the `order_created` audit row must always record the **real** caller's role (`actorRoleName`), never a hardcoded label. It guards against any code path (e.g. checkout's own purchases) silently rewriting the actor to "customer."

## Key elements

- **`contextAs(role, id)`** – local helper that assembles a `CallerContext` with a named tenant role and a `callerAs` identity; simulates what a resolved HTTP request would produce.
- **`jest.mock('@infrastructure/observability/audit', …)`** – full module replacement (not a spy). Exposes a fresh `emitAuditEvent` mock and re-implements `recordAudit` so it routes through that mock, because the real `recordAudit` closes over the original `emitAuditEvent`.
- **`jest.mock('@infrastructure/observability/analytics', …)`** – stubs `emitAnalyticsEvent` to keep the test focused on the audit port.
- **`setupTestDb()`** – provisions a real (temporary) database for the duration of the suite.
- **Two `it` blocks** – one for a `moderator` caller, one for an `admin` caller; each asserts `emitAuditEvent` received `action: ordersAuditActions.ORDER_CREATED`, `outcome: 'success'`, and the correct `actorRoleName`.

## Relationships

- **`src/infrastructure/observability/audit.ts`** – the audited port. The test mocks the whole module; it calls the real `buildAuditEvent` via `jest.requireActual` while intercepting `emitAuditEvent`.
- **`src/modules/orders/audit.ts`** – supplies `ordersAuditActions.ORDER_CREATED` used in assertions.
- **`src/modules/orders/services/index.ts`** → **`src/modules/orders/services/crud.ts`** – the `create` function under test (buyer ID, email, line items, caller context).
- **`src/modules/users/tests/factories.ts`** – `createUser` provides a real buyer row.
- **`src/modules/products/tests/factories.ts`** – `createProduct` provides a purchasable product row.
- **`src/types/auth-context.ts` / `src/types/index.ts`** – `CallerContext` type and its barrel re-export.
- **`tests/support/callers.ts`** – `callerAs` builds the `caller` sub-object inside `CallerContext`.
- **`tests/support/ports.ts`** – `observePort` wraps a port function into a Jest spy for assertion.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` lifecycle (create/teardown) for the real database.

## Notes

- **Port is replaced, not spied.** The file comment (and the mock body) explain that `jest.spyOn` fails on the non-configurable getter exposed by a CommonJS namespace import; a full `jest.mock` replacement is the workaround.
- **`recordAudit` rerouting.** Because `recordAudit` in the real module closes over its own `emitAuditEvent`, the mock explicitly re-implements `recordAudit` to call the *mocked* `emitAuditEvent` (via `buildAuditEvent`), ensuring every audit path is observable through a single spy.
- The module-level doc comment states the invariant in plain language; the two tests are the minimal role-set to catch both "too permissive" (admin → customer) and "too restrictive" (moderator → customer) regressions.
