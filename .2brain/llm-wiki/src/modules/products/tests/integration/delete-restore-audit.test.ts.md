---
source: src/modules/products/tests/integration/delete-restore-audit.test.ts
sha256: 8adf7de88b3bc82f9afff2fd4c6eae778cdc295ef36ea9288dfad70b503812f7
generated_at: 2026-10-15T11:47:37.953857+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/delete-restore-audit.test.ts

## Purpose

Integration tests that pin the audit-logging contract for `productService.removeById` and `productService.restoreById`. They verify that the correct `ADMIN_PRODUCT_DELETED` / `ADMIN_PRODUCT_RESTORED` events are emitted from the **service layer** (not a controller) with the expected fields, and that no event fires when no caller context is supplied.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the entire audit port module. The mock spreads the real module's exports, swaps `emitAuditEvent` for a `jest.fn()`, and rewrites `recordAudit` to call `buildAuditEvent` then the mock emitter (skipping emission when `context` is falsy).
- **`setupTestDb()`** — Boots the test database before any test runs.
- **`describe('removeById')`** — Three cases: soft-delete audit with `hardDelete: false`, hard-delete audit with `hardDelete: true`, and no-context no-audit.
- **`describe('restoreById')`** — Two cases: successful restore audit, and no-context no-audit.
- **`observePort(auditPort.emitAuditEvent)`** — Captures the mock call history as a spy for assertions (from `tests/support/ports.ts`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/services/index.ts` | Source of `productService` — the system under test. |
| `src/modules/products/audit.ts` | Provides the `productsAuditActions` enum values asserted in expectations. |
| `src/infrastructure/observability/audit.ts` | Fully **mocked**; the test asserts against its `emitAuditEvent` and `buildAuditEvent` exports. |
| `src/modules/products/tests/factories.ts` | Supplies `createProduct()` to seed a product row before each scenario. |
| `tests/support/callers.ts` | Supplies `callerContextAs('admin')` to build a valid caller context. |
| `tests/support/ports.ts` | Supplies `observePort` to read mock call history. |
| `tests/support/setup-test-db.ts` | Supplies `setupTestDb` for database lifecycle. |

## Notes

- **Port replacement, not spying.** The module docblock and inline comment explain that `jest.spyOn` cannot intercept `emitAuditEvent` because a CommonJS namespace import exposes a non-configurable getter. The full rationale is cross-referenced in `orders/tests/integration/create-audit.test.ts`.
- **`recordAudit` guard.** The mock's `recordAudit` implementation early-returns when `context` is `null`/`undefined`, mirroring the production contract that audit events require a caller context.
- **Layer assertion.** The file's module-level JSDoc ties these tests to "rule 1" in `docs/theory/module-lifecycle.md`: write-path audit rows must be emitted by the service, not the controller.
