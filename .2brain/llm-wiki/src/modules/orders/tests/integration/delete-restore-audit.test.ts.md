---
source: src/modules/orders/tests/integration/delete-restore-audit.test.ts
sha256: 1a5e63a2355d26e8a574ff0a9140105c34e37a218cc97f4eef77e9d2a182b368
generated_at: 2026-10-15T11:13:51.256828+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/delete-restore-audit.test.ts

## Purpose

Integration tests verifying that `removeById` and `restoreById` (service layer) emit the correct `ORDER_DELETED` / `ORDER_RESTORED` audit events with the expected fields, after those emissions were moved out of the controller into the service to match the cross-module write-path convention (rule 1 in `docs/theory/module-lifecycle.md`).

## Key elements

- **`jest.mock('@infrastructure/observability/audit')`** — Replaces `emitAuditEvent` with a `jest.fn()` while keeping `buildAuditEvent` and `recordAudit` from the real module. `recordAudit` is re-wired so it calls `buildAuditEvent` then the spied `emitAuditEvent`, and no-ops when context is `null`.
- **`describe('removeById')`** — Three cases: soft delete emits `ORDER_DELETED` with `metadata.hardDelete: false`; hard delete emits the same action with `hardDelete: true`; calling without caller context emits nothing.
- **`describe('restoreById')`** — Two cases: restore emits `ORDER_RESTORED` with correct fields; calling without caller context emits nothing.
- **`setupTestDb()`** — Initialises an in-memory / test database before the suite runs.
- **`afterEach(() => jest.restoreAllMocks())`** — Resets all spies between tests.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — Mocked module; provides `emitAuditEvent`, `recordAudit`, `buildAuditEvent`. The test intercepts the emission boundary here.
- **`src/modules/orders/audit.ts`** — Source of the `ordersAuditActions` enum (`ORDER_DELETED`, `ORDER_RESTORED`) used in assertions.
- **`src/modules/orders/services/index.ts`** — Re-exports `removeById` and `restoreById`, the functions under test.
- **`src/modules/orders/services/remove.ts`** — Implementation of `removeById` (pulled in via the services barrel).
- **`src/modules/orders/tests/factories.ts`** — `seedOrder` creates a known-order fixture in the test DB.
- **`src/types/index.ts`** — `OrderStatus` enum used to parameterise seeded orders.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` builds the caller-context argument passed to the services.
- **`tests/support/ports.ts`** — `observePort` wraps the mocked `emitAuditEvent` so assertions can read call arguments.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions the test database.

## Notes

- The audit module is **replaced** via `jest.mock`, not spied on. `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes; the full rationale lives in the sibling `create-audit.test.ts` in the same directory.
- The mock's `recordAudit` guard (`if (!context) return`) mirrors the production contract: a `null` context short-circuits before any event is built or emitted.
- Tests assert on the *event object shape* (action, outcome, targetType, targetId, metadata), not on raw DB rows, because the emission boundary is the observable contract at this layer.
