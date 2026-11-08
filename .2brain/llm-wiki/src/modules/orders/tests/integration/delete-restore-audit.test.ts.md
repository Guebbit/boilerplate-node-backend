---
source: src/modules/orders/tests/integration/delete-restore-audit.test.ts
sha256: 2b962183848f60f93f938cb58dc87ad2b22da8511afd8bb7a3cce76fc8a23656
generated_at: 2026-11-08T07:04:01.617660+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/delete-restore-audit.test.ts

## Purpose
Integration test that pins the audit events emitted by `orderService.removeById` and `orderService.restoreById`. It verifies that `ORDER_DELETED` / `ORDER_RESTORED` rows still land at the correct layer (the service, not the controller) with the expected action, outcome, target, and metadata fields, including the `hardDelete` flag and the no-context guard.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the audit port module entirely (delegating to `auditPortMock()`) rather than spying on it, because the CJS namespace getter is non-configurable.
- **`setupTestDb()`** — Initialises the in-memory test database before the suite runs.
- **`describe('removeById')`** — Three tests: soft-delete audit (`hardDelete: false`), hard-delete audit (`hardDelete: true`), and no-audit when called without caller context.
- **`describe('restoreById')`** — Two tests: restore audit (`ORDER_RESTORED`) and no-audit without caller context.
- **`observePort(auditPort.emitAuditEvent)`** — Returns a Jest spy over the mocked port's emit method for assertion.
- **`ordersAuditActions`** (from `../../audit`) — Enum/constants for the expected `action` field values.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — The module under test; fully replaced via `jest.mock` so no real I/O occurs.
- **`src/modules/orders/audit.ts`** — Supplies `ordersAuditActions` constants used in expected-value assertions.
- **`src/modules/orders/services/index.ts`** — Source of `orderService`, the SUT whose `removeById`/`restoreById` methods are exercised.
- **`src/modules/orders/tests/factories.ts`** — Provides `seedOrder` to create known-order fixtures.
- **`src/types/index.ts`** — Provides `OrderStatus.canceled` used when seeding.
- **`tests/support/ports.ts`** — Provides `auditPortMock` (the replacement factory) and `observePort` (the spy accessor).
- **`tests/support/callers.ts`** — Provides `callerContextAs('admin')` to supply a valid caller context.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb` for DB initialisation.

## Notes

- The port is **replaced**, not spied on. The inline comment explains that `jest.spyOn` cannot intercept the non-configurable getter that a CommonJS namespace import exposes; `jest.mock` with a factory is the only reliable path.
- The "no context" tests confirm the service silently skips audit emission when no caller is provided — this is an intentional guard, not an error path.
- The file header references `docs/theory/module-lifecycle.md` (rule 1) as the architectural rationale for why audit emission lives in the service layer rather than the controller.
