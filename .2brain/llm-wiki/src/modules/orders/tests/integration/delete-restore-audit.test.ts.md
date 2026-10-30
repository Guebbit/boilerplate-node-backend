---
source: src/modules/orders/tests/integration/delete-restore-audit.test.ts
sha256: 2873631a9f00bfeb3fe50b4b03892ee0ff68c8b6709905916f038a8764603482
generated_at: 2026-10-29T04:52:25.590201+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/delete-restore-audit.test.ts

## Purpose

Integration test that pins the audit-event contract for `orderService.removeById` and `orderService.restoreById`. It verifies that `ORDER_DELETED` (with `hardDelete` flag in metadata) and `ORDER_RESTORED` events are emitted with the expected fields, and that no audit row is written when no caller context is supplied. It exists to guard the refactor that moved audit-row creation out of the delete/restore controllers into the service layer.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the entire audit port module with `auditPortMock()` from `@tests/ports`. (Not a spy; see Notes.)
- **`describe('removeById')`** — Three cases: soft-delete audit (`hardDelete: false`), hard-delete audit (`hardDelete: true`), and no-context (no event emitted).
- **`describe('restoreById')`** — Two cases: restore audit (`ORDER_RESTORED`) and no-context (no event emitted).
- **`observePort(auditPort.emitAuditEvent)`** — Captures emitted events for assertion without monkey-patching.
- **`seedOrder(OrderStatus.cancelled)`** — Creates a cancellable order in the test DB for each case.

## Relationships

| Neighbor | Role |
|---|---|
| `src/modules/orders/services/index.ts` | Provides `orderService.removeById` / `.restoreById` under test. |
| `src/modules/orders/audit.ts` | Exports `ordersAuditActions` enum used in expected assertions. |
| `src/infrastructure/observability/audit.ts` | The audit port whose `emitAuditEvent` is mocked and observed. |
| `tests/support/ports.ts` | Supplies `auditPortMock()` (used by `jest.mock`) and `observePort` helper. |
| `tests/support/callers.ts` | Supplies `callerContextAs('admin')` to provide caller context. |
| `tests/support/setup-test-db.ts` | Called once (`setupTestDb()`) to prepare an in-memory DB before all tests. |
| `src/modules/orders/tests/factories.ts` | `seedOrder` factory for creating fixture orders. |
| `src/types/index.ts` | `OrderStatus.cancelled` used when seeding. |

## Notes

- **Port is replaced, not spied on.** The module docstring and inline comment both call out that `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import (`import * as auditPort from …`) exposes. The full rationale is in the sibling file `create-audit.test.ts` in the same directory.
- **No-context guard is a contract.** Calling `removeById`/`restoreById` without a caller context must silently skip audit emission. Both describe blocks include this negative case.
- **Module-lifecycle rule 1** (`docs/theory/module-lifecycle.md`) requires audit-row creation to live in the service layer, not the controller. This test is the regression guard for that placement.
