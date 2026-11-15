---
source: src/modules/audit-logs/tests/unit/service.test.ts
sha256: b55ac968142fbbe06f6607037546ba128dda9258651fa59ca36bf3e9bc0a69e9
generated_at: 2026-11-14T19:26:56.845866+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/service.test.ts

## Purpose

Unit tests for the two functions in `auditLogService` (`record` and `search`), focused on their deliberately asymmetric failure behavior: `record` is fail-open (must never throw, swallows rejections into a log line) while `search` is fail-closed (a failure *is* the response to the admin caller). The repository is mocked so it can be made to fail on demand.

## Key elements

- **`readCounter`** — async helper that reads the current value of `auditSinkFailuresTotal` back through prom-client's `.get()` (not a local tally), confirming the metric reaches the scrape registry.
- **`jest.mock('@modules/audit-logs/repository', …)`** — mocks `create`/`search` as `jest.fn()` but keeps the **real** `sinceScope` and `ownOrderScope` implementations, because the test must verify the service actually hands `since` to the scope builder (a stub would pass regardless).
- **`jest.mock('@infrastructure/adapters/logger', …)`** — replaces the module's exported `logger` with `{ warn, error, info }` jest spies.
- **`mockedRepository` / `mockedLogger`** — `jest.Mocked<…>` casts for typed access to the spies.
- **`makeEntry(overrides?)`** — factory returning a fully-populated `AuditEntry` with sensible defaults; spread `overrides` to vary a single field.
- **`describe('auditLogService.record')`** — 7 tests covering: pass-through to repository, void return (fire-and-forget contract), swallowed rejection → warning log, counter increment on failure, counter unchanged on success, no unhandled rejection, and action name present in the warning.
- **`describe('auditLogService.search')`** — 3 tests covering: filter/pagination pass-through with sort spec, `since` routed to the scope argument (not the filter), and rejection propagation (no swallow, no warning log).

## Relationships

- **`src/modules/audit-logs/service.ts`** — system under test; imports `auditLogService`.
- **`src/modules/audit-logs/repository.ts`** — fully mocked at the module level; the test asserts call arguments on `create` and `search`, and uses the real `sinceScope`/`ownOrderScope` implementations to verify scope routing.
- **`src/infrastructure/adapters/logger.ts`** — fully mocked at the module level; the test attaches spies to the exported `logger` object and asserts on `warn` calls in the fail-open path.
- **`src/modules/audit-logs/metrics.ts`** — `auditSinkFailuresTotal` is read (not mocked) to assert the failure counter increments on the same path that swallows the error.
- **`src/infrastructure/observability/audit.ts`** — type-only import of `AuditEntry` used by `makeEntry`.
- **`src/modules/audit-logs/model.ts`** — type-only import of `AuditLogDocument` used with `asStub`.
- **`src/types/index.ts`** — type-only import of `AuditEntryItem` for the `emptyPage` fixture in search tests.
- **`tests/support/stub.ts`** — `asStub` produces a typed empty object for `AuditLogDocument` return values.

## Notes

- The repository mock intentionally keeps the **real** `sinceScope` logic. A stubbed version would make the "hands `since` to scope" test vacuous.
- Rejection handling in `record` resolves across **two microtask ticks**; tests use `await Promise.resolve(); await Promise.resolve();` to land on the correct tick. The unhandled-rejection test instead uses `setImmediate` to flush the entire macrotask queue.
- The counter assertion reads through prom-client's registry (`.get()`) rather than a local variable, ensuring the metric actually reaches the `/observability/metrics` scrape endpoint.
- `record`'s void-return test carries an `eslint-disable` for `@typescript-eslint/no-confusing-void-expression` because the assertion *is* the check that the function returns `undefined`.
- The `asStub` helper from `tests/support/stub.ts` is used only to satisfy TypeScript for `AuditLogDocument` values that the test never inspects.
