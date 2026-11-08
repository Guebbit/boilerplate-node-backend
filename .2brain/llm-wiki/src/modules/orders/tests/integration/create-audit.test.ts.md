---
source: src/modules/orders/tests/integration/create-audit.test.ts
sha256: 1a0e054a743f8aa29cbbe586a511572204797b05766e6239595cf73067003086
generated_at: 2026-11-08T07:03:49.852393+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/create-audit.test.ts

## Purpose

Integration test that verifies the `order_created` audit row always records the **real** caller role (`actorRoleName`) rather than a hard-coded label (e.g. "customer"). It guards against a regression where checkout's own purchase path could mask the true identity of the actor in the audit trail.

## Key elements

- **`contextAs(role, id?)`** – local helper that builds a `CallerContext` with a named tenant role, mimicking what a resolved HTTP request would produce.
- **`jest.mock('@infrastructure/observability/audit', …)`** – fully **replaces** the audit port with `auditPortMock()` from `tests/support/ports` (not a `jest.spyOn`).
- **`jest.mock('@infrastructure/observability/analytics', …)`** – stubs `emitAnalyticsEvent` to isolate the audit assertion from analytics side-effects.
- **`describe('create — the audit row records the real caller…')`** – two cases:
  - Moderator places an order → audit row has `actorRoleName: 'moderator'`.
  - Admin places an order → audit row has `actorRoleName: 'admin'`.
- **`setupTestDb()`** – initialises the in-memory Mongo instance for the test run.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/index.ts` | `orderService.create` is the system under test. |
| `src/modules/orders/audit.ts` | Provides `ordersAuditActions.ORDER_CREATED` used in assertions. |
| `src/infrastructure/observability/audit.ts` | Fully mocked; observed via `observePort(auditPort.emitAuditEvent)`. |
| `tests/support/ports.ts` | Supplies `auditPortMock()` (the replacement) and `observePort` (the assertion helper). |
| `tests/support/callers.ts` | `callerAs` builds the `CallerContext.caller` field inside `contextAs`. |
| `tests/support/setup-test-db.ts` | Bootstraps the shared test database. |
| `src/modules/users/tests/factories.ts` | `createUser` creates the buyer fixture. |
| `src/modules/products/tests/factories.ts` | `createProduct` creates the purchasable item fixture. |
| `src/types/index.ts` / `src/types/auth-context.ts` | Source of the `CallerContext` type used by `contextAs`. |

## Notes

- The audit port is **replaced** (`jest.mock`), not spied on. The file's comment points to `cancel.test.ts` for the full rationale: `jest.spyOn` cannot redefine the non-configurable getter exposed by a CommonJS namespace import.
- `afterEach(() => jest.restoreAllMocks())` runs after every test to prevent cross-test leakage of the replaced port.
- The module-level JSDoc states the invariant explicitly: no code path may force `actorRole` / `actorRoleName` to a fixed value, even for checkout-initiated purchases.
