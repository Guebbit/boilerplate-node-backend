---
source: src/modules/audit-logs/tests/unit/service.test.ts
sha256: 2c6716ec7729dec5c91ee5ab23e7cf9633b7ee9265c09ce53dd78a4a33b7105d
generated_at: 2026-10-29T03:19:24.829647+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/service.test.ts

## Purpose

Unit tests for `auditLogService.record` and `auditLogService.search`, focused exclusively on their deliberate failure asymmetry: `record` is fail-open (swallows write failures into a log line + metric, never throws) while `search` is fail-closed (propagates read failures to the caller). The repository and logger are mocked because a real repository cannot be made to fail on demand.

## Key elements

- **`readCounter`** — reads the current value of `auditSinkFailuresTotal` back through the prom-client registry (`.get()`), so the test asserts the counter actually reached the scrape endpoint rather than a local variable.
- **`jest.mock('@modules/audit-logs/repository', …)`** — stubs `create` and `search` as `jest.fn()`, but keeps the **real** `sinceScope` and `ownOrderScope` fragment builders so the test can verify the service hands `since` to the scope.
- **`jest.mock('@infrastructure/adapters/logger', …)`** — replaces `logger` with `warn`/`error`/`info` spies.
- **`mockedRepository` / `mockedLogger`** — `jest.Mocked`-typed handles used throughout the suites.
- **`makeEntry(overrides?)`** — factory returning a populated `AuditEntry` with sensible defaults; tests override individual fields.
- **`describe('auditLogService.record')`** — asserts: entry passed to `repository.create` unchanged; return value is `undefined` (void, no awaitable); failed write → `logger.warn` with the original `Error` object; failure increments `auditSinkFailuresTotal`; success does not; no `unhandledRejection` fires; the failing `action` name appears in the warning payload.
- **`describe('auditLogService.search')`** — asserts: filters and pagination passed through to `repository.search` with the sort spec; `since` is routed to the second (scope) argument as `{ timestamp: { $gt: since } }`; a failed read is re-thrown to the caller and does **not** trigger `logger.warn`.

## Relationships

- **`src/modules/audit-logs/service.ts`** — the unit under test; imports `auditLogService`.
- **`src/modules/audit-logs/repository.ts`** — mocked; provides `auditLogRepository` (create, search, sinceScope, ownOrderScope) and the `AUDIT_SORT` constant.
- **`src/infrastructure/adapters/logger.ts`** — mocked; provides the `logger` whose `warn` is asserted on.
- **`src/infrastructure/observability/audit.ts`** — type-only import of `AuditEntry` for the fixture factory.
- **`src/modules/audit-logs/model.ts`** — type-only import of `AuditLogDocument` for mock return values.
- **`src/modules/audit-logs/metrics.ts`** — imports `auditSinkFailuresTotal` so tests can read the counter via the shared prom-client registry.
- **`src/types/index.ts`** — type-only import of `AuditEntryItem` used in the `emptyPage` fixture for `search` tests.

## Notes

- The repository mock intentionally uses the **real** `sinceScope` implementation rather than a stub. A stub would pass regardless of whether the service actually calls it; the real fragment builder lets the test confirm the `since` → scope routing.
- `record`'s `void` return is asserted explicitly (`toBeUndefined()`). The contract is fire-and-forget: no caller should be able to `await` the audit write and thereby block the request.
- The `record` failure path is asynchronous (floating promise with `.catch()`), so assertions must wait two microtask ticks (`await Promise.resolve(); await Promise.resolve()`) before checking `logger.warn` or the counter.
- The unhandled-rejection test attaches a `process.on('unhandledRejection')` listener and uses `setImmediate` (a macrotask, not a microtask) to let the event loop settle before asserting.
- `since` is passed as a second argument to `repository.search` (the scope), not folded into the filter object. This keeps it a `Date` in the MongoDB query rather than being coerced to a number by whatever serialization `buildWhere` might apply.
