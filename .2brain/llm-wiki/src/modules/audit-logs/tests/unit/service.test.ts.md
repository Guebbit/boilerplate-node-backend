---
source: src/modules/audit-logs/tests/unit/service.test.ts
sha256: 5c7661c59556a075fd4a46af465c39fc1149e363a4e2d9d392c9abccdcd262ac
generated_at: 2026-10-14T15:07:18.501969+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/service.test.ts

## Purpose

Unit tests for `auditLogService`'s two functions, focused on their deliberately asymmetric failure semantics: `record` must never throw (fail-open, fire-and-forget) while `search` must propagate errors (fail-closed, admin-facing read). The repository and logger are mocked so failures can be triggered on demand.

## Key elements

- **`readCounter()`** — helper that reads `auditSinkFailuresTotal` back through prom-client's `.get()` to verify the metric actually lands in the scrape registry.
- **`jest.mock('@modules/audit-logs/repository', …)`** — replaces the repository with `jest.fn()` stubs for `create`/`search`, but keeps a **real** `sinceScope` implementation so tests can assert the service passes `since` into scope (not into the filter object). Also exports `AUDIT_SORT`.
- **`jest.mock('@infrastructure/adapters/logger', …)`** — replaces `logger.warn/error/info` with spies.
- **`makeEntry(overrides?)`** — factory returning a fully-populated `AuditEntry` for consistent test fixtures.
- **`describe('auditLogService.record')`** — seven tests covering: pass-through of the entry, `void` return (no awaitable promise), error swallowed into `logger.warn` with the original `Error` object, counter increment on failure, counter stability on success, no unhandled-rejection event, and action name in the warning.
- **`describe('auditLogService.search')`** — three tests covering: filter/page pass-through and sort projection, `since` routed to the scope object (keeping it a `Date`), and error propagation (no `logger.warn` call).

## Relationships

- **`src/modules/audit-logs/service.ts`** — the unit under test; `auditLogService.record` and `auditLogService.search` are exercised directly.
- **`src/modules/audit-logs/repository.ts`** — fully mocked; tests assert how the service calls `create`, `search`, and `sinceScope`.
- **`src/infrastructure/adapters/logger.ts`** — mocked; tests assert `logger.warn` is called with specific fields on record-failure and *not* called on search-failure.
- **`src/modules/audit-logs/metrics.ts`** — `auditSinkFailuresTotal` is not mocked; the test reads its live value via prom-client to confirm the counter increments in the same code path that swallows the error.
- **`src/infrastructure/observability/audit.ts`** — provides the `AuditEntry` type used by `makeEntry`.
- **`src/modules/audit-logs/model.ts`** — provides `AuditLogDocument` for typing the mocked `create` return.
- **`src/types/index.ts`** — provides `AuditEntryItem` used in the `emptyPage` fixture for search tests.

## Notes

- The microtask-flush pattern (`await Promise.resolve()` twice) is repeated because `record` is fire-and-forget; assertions on side effects (logger calls, counter) must wait for the `.catch` handler to run.
- The unhandled-rejection test uses `setImmediate` (a macrotask) rather than microtask flushes to ensure the event loop has a chance to fire the handler.
- `sinceScope` is intentionally **not** stubbed — it runs the real fragment-builder logic so the test verifies the service routes `since` into scope (preserving `Date` type) rather than into the `buildWhere` filter path.
- The `record` return-type test (`toBeUndefined`) carries an `eslint-disable` for `no-confusing-void-expression` because the assertion *is* the contract check.
