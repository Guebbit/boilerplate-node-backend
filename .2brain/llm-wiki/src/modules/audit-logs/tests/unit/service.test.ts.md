---
source: src/modules/audit-logs/tests/unit/service.test.ts
sha256: 0f64dff36cdd027b796cc086a43fdf9f3bfce9fa06cd4aa1702f14561a6f3d11
generated_at: 2026-09-23T18:28:33.891159+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/service.test.ts

## Purpose

Unit tests for `auditLogService` that verify the deliberate fail-open / fail-closed asymmetry between `record` and `search`, the metric counter that records lost writes, and the correctness of filter/scope pass-through to the repository.

## Key elements

- **`readCounter`** — async helper that reads `auditSinkFailuresTotal` back through prom-client's `.get()` to confirm the counter reached the metrics registry (not just a local tally).
- **`makeEntry`** — factory that returns a fully-populated `AuditEntry` with sensible defaults, accepting `Partial<AuditEntry>` overrides.
- **`describe('auditLogService.record', …)`** — covers: entry forwarded unchanged; return type is `void` (fire-and-forget); rejection swallowed into `logger.warn` with the original `Error` object under `error`; counter incremented on failure; counter untouched on success; no `unhandledRejection` emitted; warning includes the failing `action` name.
- **`describe('auditLogService.search', …)`** — covers: filters + pagination passed through untouched with `AUDIT_SORT`; `since` routed into the scope argument (not merged into `buildWhere`); rejection propagated to caller (fail-closed).
- **`jest.mock('@modules/audit-logs/repository', …)`** — stubs `create` and `search`, but ships a *real* `sinceScope` implementation so that scope-building logic is exercised rather than assumed.
- **`jest.mock('@infrastructure/adapters/logger', …)`** — replaces `warn`, `error`, `info` with `jest.fn()` spies.

## Relationships

- **`src/modules/audit-logs/service.ts`** — the unit under test; both `record` and `search` are called directly via `auditLogService`.
- **`src/modules/audit-logs/repository.ts`** — fully mocked; `create`, `search`, and `sinceScope` are the interaction surface.
- **`src/infrastructure/adapters/logger.ts`** — mocked; assertions verify `warn` is called with the correct shape on `record` failures and is *not* called on `search` failures.
- **`src/modules/audit-logs/metrics.ts`** — `auditSinkFailuresTotal` is read via prom-client to assert increment/reset behavior.
- **`src/infrastructure/observability/audit.ts`** — source of the `AuditEntry` type used to shape test fixtures.
- **`src/modules/audit-logs/model.ts`** — source of the `AuditLogDocument` type used as the mocked repository return value.

## Notes

- Async assertions after `record` call two microtask ticks (`await Promise.resolve()` ×2) to let the internal `.catch()` settle; `setImmediate` is used instead when asserting on `unhandledRejection`.
- The `sinceScope` mock is intentionally a real implementation (not a `jest.fn()`) so that a regression in how the service passes `since` would actually change the scope object, rather than passing silently.
- An `eslint-disable-next-line @typescript-eslint/no-confusing-void-expression` suppresses a lint rule on the `toBeUndefined()` assertion — the suppression is deliberate and documented inline.
- The counter test reads the value *before* and *after* the failing call to avoid coupling to the absolute counter value (other test runs or parallel suites may have incremented it).
