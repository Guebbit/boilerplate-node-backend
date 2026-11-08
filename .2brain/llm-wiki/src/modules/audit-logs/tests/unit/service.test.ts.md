---
source: src/modules/audit-logs/tests/unit/service.test.ts
sha256: 2c6716ec7729dec5c91ee5ab23e7cf9633b7ee9265c09ce53dd78a4a33b7105d
generated_at: 2026-11-08T05:10:37.175578+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/service.test.ts

## Purpose

Unit tests for the two functions in `auditLogService` (`record` and `search`). The tests exist to lock in the deliberate failure asymmetry: `record` must swallow every write failure (fail-open) while `search` must propagate read failures (fail-closed). The repository is mocked so failures can be induced deterministically.

## Key elements

- **`readCounter()`** — async helper that reads the current value of `auditSinkFailuresTotal` via prom-client's `.get()`, returning the first gauge value or `0`. Used to assert the metric increments/decrements without reading a local tally.
- **`jest.mock('@modules/audit-logs/repository', …)`** — replaces the repository with a mock whose `sinceScope` is the *real* fragment builder (not a stub), ensuring the test verifies the service hands `since` to the scope correctly.
- **`jest.mock('@infrastructure/adapters/logger', …)`** — stubs `warn`, `error`, `info` for call assertions.
- **`makeEntry(overrides?)`** — factory returning a fully-populated `AuditEntry` with sensible defaults; accepts partial overrides.
- **`describe('auditLogService.record')`** — covers: entry passthrough to `repository.create`, void return (fire-and-forget contract), rejection swallowed into `logger.warn` with the `Error` object (not just its message), metric increment on failure, metric unchanged on success, no unhandled-rejection event, and the failing `action` name included in the warning.
- **`describe('auditLogService.search')`** — covers: filter passthrough and sort order, `since` routed to the scope (not `buildWhere`), and rejection propagation to the caller (with no `logger.warn` call).

## Relationships

- **`src/modules/audit-logs/service.ts`** — the unit under test; the file imports `auditLogService` directly.
- **`src/modules/audit-logs/repository.ts`** — mocked; its `create` and `search` methods are the primary collaborators being asserted against. `sinceScope` and `ownOrderScope` are exercised in their real form.
- **`src/infrastructure/adapters/logger.ts`** — mocked; assertions verify `warn` is called with specific payload shapes on `record` failures and is *not* called on `search` failures.
- **`src/modules/audit-logs/metrics.ts`** — `auditSinkFailuresTotal` is read via `.get()` to confirm the Prometheus counter increments on a failed write and stays put on success.
- **`src/infrastructure/observability/audit.ts`** — supplies the `AuditEntry` type used by `makeEntry`.
- **`src/modules/audit-logs/model.ts`** — supplies the `AuditLogDocument` type used in mock return values.
- **`src/types/index.ts`** — supplies the `AuditEntryItem` type used in the `emptyPage` fixture for search tests.

## Notes

- Rejection assertions in the `record` block require two `await Promise.resolve()` microtask ticks (or a `setImmediate`) before the `.catch()` handler fires and the logger/metric side-effects are observable. Skipping this yields a false "not called" failure.
- The `record` void-return test carries an inline `eslint-disable` for `@typescript-eslint/no-confusing-void-expression`; the assertion *is* the contract that no caller can `await` the call.
- The `sinceScope` mock is intentionally the real implementation (not a `jest.fn()`), because a stub would pass regardless of whether the service correctly routes `since` to the scope parameter versus the filter object.
- `readCounter` reads through prom-client's registry API rather than a local variable, confirming the metric is actually registered and scrapeable by `/observability/metrics`.
