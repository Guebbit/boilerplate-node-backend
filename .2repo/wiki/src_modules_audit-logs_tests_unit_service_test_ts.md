# src/modules/audit-logs/tests/unit/service.test.ts

## Purpose
Unit tests for `auditLogService`, focused exclusively on the asymmetric error contract: `record` must be fail-open (swallow write failures, return `void`, never throw or leak an unhandled rejection) while `search` must be fail-closed (propagate read failures to the caller). The tests verify these guarantees plus the side-channel metric that makes lost rows observable.

## Key elements
- **`describe('auditLogService.record')`** — six cases: passthrough to `repository.create`, `void` return type, warning on failure (with action name and error message), Prometheus counter increment on failure, counter stability on success, and absence of unhandled rejections.
- **`describe('auditLogService.search')`** — three cases: filter/pagination passthrough, `since` routed to the scope argument (not merged into filters), and rejection propagation without logging a warning.
- **`readCounter`** — helper that reads `auditSinkFailuresTotal` back through the prom-client registry, confirming the metric actually reaches the scrape endpoint.
- **`makeEntry`** — factory that builds a fully-typed `AuditEntry` with sensible defaults and an `overrides` spread.
- **Mock setup** — `auditLogRepository` is fully mocked (including a *real* `sinceScope` implementation to catch misuse), `logger` is stubbed to three `jest.fn()`s.

## Relationships
- **`src/modules/audit-logs/service.ts`** — the unit under test; imported via the barrel as `auditLogService`.
- **`src/modules/audit-logs/repository.ts`** — mocked; the tests assert the exact call signatures (`create(entry)`, `search(filters, scope, sort)`) that `service.ts` delegates to.
- **`src/modules/audit-logs/metrics.ts`** — `auditSinkFailuresTotal` is read via its prom-client handle to verify the counter increments on the fail-open path.
- **`src/modules/audit-logs/model.ts`** — provides the `AuditLogDocument` type used in mock return values and the `emptyPage` fixture.
- **`src/infrastructure/observability/audit.ts`** — source of the `AuditEntry` type that shapes `makeEntry` and every test fixture.
- **`src/infrastructure/adapters/logger.ts`** — mocked; assertions check that `logger.warn` receives the expected structured payload on failure and is *not* called on `search` failure.
- **`src/modules/audit-logs/index.ts`** — barrel re-export through which `auditLogService` is imported.

## Notes
- **Async assertions require two `await Promise.resolve()` ticks** (or a `setImmediate`) because `record` is fire-and-forget; the `.catch()` resolves on a microtask after the call returns. This is easy to miss when refactoring the service's internal promise chain.
- **`sinceScope` is intentionally *not* stubbed** — the mock uses the real fragment-builder so the test catches a regression where `since` is passed to `buildWhere` (which would `Number()`-coerce the Date) instead of the scope parameter.
- **The counter is read through the prom-client registry**, not a local variable, to guarantee the metric is registered where `/observability/metrics` actually scrapes it.
- **No integration path**: the repository is mocked rather than driven against an in-memory Mongo, because the suite's target is the error *contract*, and a real repository cannot be made to fail on demand.
- **`record`'s `void` return is asserted** (`expect(...).toBeUndefined()`) with an ESLint disable — the signature itself is the contract preventing callers from awaiting the audit write.
