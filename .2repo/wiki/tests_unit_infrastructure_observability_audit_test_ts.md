# tests/unit/infrastructure/observability/audit.test.ts

## Purpose

Unit tests for the core audit-logging subsystem: event emission, sink registration, request-context extraction, and the app-level security action constants. Ensures the audit path degrades safely (no disk writes, no exceptions escaping) in test and worker environments.

## Key elements

- **`coreAuditActions` tests** — Asserts the three app-level strings (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`). Domain-specific action strings are intentionally *not* asserted here; each module pins its own in `src/modules/<name>/tests/unit/audit.test.ts`.
- **`emitAuditEvent` tests** — Verifies the function routes to `auditLogger.log` with level `info` (success) or `warn` (failure / security actions), and that all `AuditEvent` fields pass through intact.
- **`registerAuditSink` tests** — Covers sink invocation, `AuditEntry` shape (Date-typed `timestamp`, derived `level`), fallback logging when no sink is active, and that a throwing sink is caught, logged via `auditLogger.warn('audit.sink.failed', …)`, and does not propagate.
- **`extractRequestContext` tests** — Confirms mapping of `ip`, `userAgent`→`user_agent`, `requestId`→`request_id`, and that `trace_id` is `undefined` absent an active OTel span.
- **Top-level spies** — `auditLogger.log` and `auditLogger.warn` are mocked to no-op at module scope to prevent disk I/O during the suite.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — The module under test. All exported symbols (`emitAuditEvent`, `extractRequestContext`, `registerAuditSink`, `coreAuditActions`, types) are imported here and exercised.
- **`src/infrastructure/adapters/logger.ts`** — Provides `auditLogger`, which is spied on to intercept log/warn calls and assert on them.

## Notes

- `registerAuditSink` stores the sink in module-level closure state. Each test in that block resets it to `() => {}` in `afterEach`; forgetting this causes cross-test contamination (a later test's events land in the earlier test's sink).
- `AuditEntry.timestamp` is asserted to be a **`Date` instance**, not an ISO string — downstream MongoDB uses it for a TTL index and a `timestamp: -1` sort, so lexicographic ordering of strings would be incorrect.
- The "no sink registered" path is exercised explicitly because that is the runtime state in unit tests and queue workers; the compliance log line must still be written.
- A throwing sink must never turn an in-flight request into a 500; the test asserts both that no exception escapes and that the failure is surfaced via a `warn` call with the error message.
