---
source: src/modules/audit-logs/tests/unit/service.test.ts
source_sha256: 20a2194ddcb5e746af29ceacac81a3672ae97e99580528aa84f4cb047c749e16
context_sha256: bab48e29f9b84d85a2a6fa5d7ba176fcc78c6e47856d40f15ca3cf0326e67ffa
generated_at: 2026-11-22T04:29:14.866194+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/tests/unit/service.test.ts

## Purpose
Unit tests for `auditLogService` (`src/modules/audit-logs/service.ts`). They pin down the deliberate asymmetry in how its two functions handle failure. `record` is fail-open: it is fire-and-forget, never throws, and turns a failed write into a warning log plus a counter increment. `search` is fail-closed: it is an explicit admin read, so a failure propagates to the caller. The repository and logger are mocked, because a real repository can't be made to fail on demand.

## Key elements
- **`jest.mock('@modules/audit-logs/repository')`**: replaces the repository with `create` and `search` as `jest.fn()`. `AUDIT_SORT`, `sinceScope` and `ownOrderScope` are provided as real, simple implementations. `sinceScope` is real so the test can show the service actually passes `since` through the scope.
- **`jest.mock('@infrastructure/adapters/logger')`**: stubs `warn`, `error` and `info` so the tests can assert what was logged.
- **`readCounter()`**: reads `auditSinkFailuresTotal` back through prom-client (`.get()`), so the test proves the metric reaches the registry rather than a local tally.
- **`makeEntry(overrides)`**: builds a valid `AuditEntry`, and each test overrides only the field it cares about.
- **`describe('auditLogService.record')`** covers these cases:
  - The entry is passed to `repository.create` unchanged.
  - The return value is `undefined`, so callers cannot await the write.
  - A rejected write does not throw. It logs `warn` with `message: 'audit entry not persisted'`, the `action`, and the original `Error` object under `error`.
  - The failure counter goes up by 1 on a failed write, and stays unchanged on success.
  - A failed write produces no `unhandledRejection`.
  - The warning names the failing action.
- **`describe('auditLogService.search')`** covers these cases:
  - Filters are passed through untouched, with an empty scope and the `{ timestamp: -1, _id: -1 }` sort, and the repository result is returned as-is.
  - `since` goes to the scope (`{ timestamp: { $gt: since } }`) and stays a `Date`. It is not coerced via the filters.
  - A rejected read propagates, and `logger.warn` is not called.

## Relationships
- Tests `auditLogService` from `src/modules/audit-logs/service.ts` (imported as `../../service`).
- Mocks `auditLogRepository` from `src/modules/audit-logs/repository.ts` and `logger` from `src/infrastructure/adapters/logger.ts`.
- Reads `auditSinkFailuresTotal` from `src/modules/audit-logs/metrics.ts` as a real, unmocked counter.
- Uses the `AuditEntry` type from `src/infrastructure/observability/audit.ts`, `AuditLogDocument` from `src/modules/audit-logs/model.ts`, and `AuditEntryItem` from `src/types/index.ts`.
- Uses `asStub` from `tests/support/stub.ts` to build typed stub documents.

## Notes
- The `record` tests wait with two `await Promise.resolve()` calls, because the rejection is handled a couple of microtasks after the call.
- The unhandled-rejection test waits a full `setImmediate` tick, with a temporary `process.on('unhandledRejection')` listener that is removed afterwards.
- The counter tests compare against a `before` value rather than an absolute number, since the counter is a shared registry metric that is never reset in this file.
- `mockedLogger.warn` is asserted as not called in the `search` failure test. This relies on mock state being cleared between tests, which is not visible in this file and presumably comes from the Jest config.
- A narrow ESLint disable is used on the `toBeUndefined()` assertion, because the assertion is itself the fire-and-forget contract.
