---
source: src/modules/audit-logs/tests/unit/service.test.ts
sha256: b773cd33386a0825cb716e181b67d324fe6618766f70763b50261648a537f12b
generated_at: 2026-09-27T14:43:46.097374+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/service.test.ts

## Purpose

Unit tests for `auditLogService` verifying its two intentionally asymmetric failure contracts: `record` is fail-open (swallows write failures into a log line, never throws) and `search` is fail-closed (propagates failures to the caller). The repository is mocked because a real one cannot be made to fail on demand.

## Key elements

- **`makeEntry(overrides?)`** — factory that builds a default `AuditEntry` with sensible values; tests override individual fields.
- **`readCounter()`** — reads `auditSinkFailuresTotal` back through prom-client's `.get()` to confirm the metric reaches the scrape registry, not a local tally.
- **`jest.mock('@modules/audit-logs/repository', …)`** — mocks `create` and `search` as `jest.fn()`, but keeps `sinceScope` as the **real** fragment builder so tests can verify `since` is routed into the scope object rather than the filter.
- **`jest.mock('@infrastructure/adapters/logger', …)`** — stubs `warn`, `error`, `info` for assertion.
- **`describe('auditLogService.record')`** — six tests covering: pass-through to repository, void return (fire-and-forget contract), swallow-into-warning on rejection, counter increment on failure, counter unchanged on success, no unhandled rejection, and action name in the warning payload.
- **`describe('auditLogService.search')`** — three tests covering: filter pass-through + paging + sort, `since` routed to scope (not filter), and failure propagation (rejects, no warn log).

## Relationships

- **`src/modules/audit-logs/service.ts`** — the system under test; `auditLogService.record` and `.search` are the only functions exercised.
- **`src/modules/audit-logs/repository.ts`** — fully mocked; the test asserts call signatures (`create(entry)`, `search(filters, scope, sort)`) and that `sinceScope` produces `{ timestamp: { $gt: since } }`.
- **`src/infrastructure/adapters/logger.ts`** — mocked; tests assert `warn` is called with `message`, `action`, and the original `Error` object (not just its message).
- **`src/modules/audit-logs/metrics.ts`** — `auditSinkFailuresTotal` is read via its prom-client API to verify the increment lands in the scrape registry.
- **`src/infrastructure/observability/audit.ts`** — provides the `AuditEntry` type used by `makeEntry`.
- **`src/modules/audit-logs/model.ts`** — provides `AuditLogDocument` used in mock return values.
- **`src/types/index.ts`** — provides `AuditEntryItem` for the `search` response shape.

## Notes

- **`sinceScope` is deliberately un-mocked.** A stub would make the "hands `since` to scope" test pass regardless of whether the service actually calls it. The real builder is the assertion target.
- **Two microtask ticks are required** after calling `record` before asserting on `logger.warn` or the counter, because the rejection is handled in a `.catch()` on a floating promise that resolves on a later tick.
- **The void-return test** (`expect(auditLogService.record(…)).toBeUndefined()`) encodes a contractual guarantee: callers *cannot* `await` the write, which is the entire point of the fire-and-forget design.
- **The unhandled-rejection test** listens on `process.on('unhandledRejection')` and flushes with `setImmediate`, verifying the `.catch()` in the service actually prevents a process-level crash.
- **The counter is read via prom-client, not a module-level variable.** This guards against the metric being incremented in the service but never registered with the `/observability/metrics` scrape endpoint.
