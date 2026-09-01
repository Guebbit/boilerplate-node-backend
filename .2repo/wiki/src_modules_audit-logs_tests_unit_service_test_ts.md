# src/modules/audit-logs/tests/unit/service.test.ts

## Purpose

Unit tests for the two functions exported by `auditLogService`. The tests focus on their deliberately asymmetric failure semantics: `record` is fail-open (must never throw, swallows rejections into a log line) and `search` is fail-closed (propagates errors to the caller). The repository is fully mocked so failure paths can be exercised deterministically.

## Key elements

- **`readCounter`** — Reads the current value of the `auditSinkFailuresTotal` Prometheus counter via `get()`, verifying the metric actually reaches the scrape-able registry.
- **`jest.mock('@modules/audit-logs/repository')`** — Stubs `create` and `search` with `jest.fn()`, but keeps `sinceScope` as the *real* fragment builder so the test can assert `since` is routed to scope rather than filters.
- **`jest.mock('@infrastructure/adapters/logger')`** — Replaces `logger` with `{ warn, error, info }` jest mocks.
- **`makeEntry(overrides?)`** — Factory returning a valid `AuditEntry` fixture (defaults: `actor_user_id: 'user-1'`, `action: 'auth.login'`, etc.).
- **`describe('auditLogService.record')`** — Seven tests: passthrough to repo, void return (fire-and-forget contract), rejection swallowed into `logger.warn`, counter incremented on failure, counter unchanged on success, no unhandled rejection, and action name included in the warning.
- **`describe('auditLogService.search')`** — Three tests: filter/pagination pass-through with `AUDIT_SORT`, `since` routed to scope (not filters), and error propagation (no swallow).

## Relationships

- **`src/modules/audit-logs/index.ts`** — Import source for `auditLogService` (the unit under test).
- **`src/modules/audit-logs/repository.ts`** — Mocked; provides `auditLogRepository.create`, `.search`, and the real `sinceScope` fragment builder.
- **`src/infrastructure/adapters/logger.ts`** — Mocked; `logger.warn` is the observable side-effect of a swallowed `record` failure.
- **`src/infrastructure/observability/audit.ts`** — Supplies the `AuditEntry` type used to construct test fixtures.
- **`src/modules/audit-logs/model.ts`** — Supplies the `AuditLogDocument` type for mock return values.
- **`src/modules/audit-logs/metrics.ts`** — Supplies `auditSinkFailuresTotal`; the test reads it via prom-client to confirm the counter lands in the registry.

## Notes

- **Async rejection timing:** `record` handles the promise rejection on a later microtask tick. Tests that assert on the `warn` call or counter increment must flush with two `await Promise.resolve()` calls (or `setImmediate` for the unhandled-rejection test).
- **`sinceScope` is intentionally unstubbed.** A stub would pass regardless of whether the service actually passes `since` through to scope; the real fragment builder makes that coupling observable.
- **`record` returns `void`, not a Promise.** One test explicitly asserts `toBeUndefined()` to guard against a signature change that would let callers `await` the audit write and couple request latency to persistence.
- **Counter read via prom-client, not a local variable.** This confirms the metric is registered and scrape-able, not just internally tallied.
- **`unhandledRejection` test uses `setImmediate`** (macrotask) rather than microtask flushes, because the floating promise's rejection surfaces on a different tick than the `.catch()` handler.
