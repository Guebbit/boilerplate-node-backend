# tests/unit/infrastructure/observability/audit.test.ts

## Purpose

Unit tests for the core audit-observability module. Verifies that audit events are logged at the correct severity level, forwarded to any registered sink, and that request-context extraction produces the expected shape — without touching disk or requiring a live OpenTelemetry SDK.

## Key elements

- **`coreAuditActions` suite** – Asserts the three app-level security action strings (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`) are stable.
- **`emitAuditEvent` suite** – Checks logger level selection (`info` for success, `warn` for failure or security actions) and that all `AuditEvent` fields (including `target_*`, `trace_id`, `metadata`) pass through intact.
- **`registerAuditSink` suite** – Verifies the sink receives an `AuditEntry`, that `timestamp` is a `Date` instance, that logging still occurs with no sink registered, and that a throwing sink is caught and reported via `auditLogger.warn` rather than propagated.
- **`extractRequestContext` suite** – Confirms extraction of `ip`, `user_agent`, `request_id` from the request object, and that `trace_id` is `undefined` when no OTel span is active.

## Relationships

- **`src/infrastructure/observability/audit.ts`** – The module under test; this file imports `emitAuditEvent`, `extractRequestContext`, `registerAuditSink`, `coreAuditActions`, and the `AuditEvent`/`AuditEntry` types.
- **`src/infrastructure/adapters/logger.ts`** – Provides `auditLogger`, which is spied on (both `log` and `warn`) so no output reaches disk during tests.

## Notes

- `auditLogger.log` and `auditLogger.warn` are mocked at **module scope** (outside any `describe`), so every test in the file runs with them inert.
- The `registerAuditSink` suite needs an `afterEach` that re-registers an inert `() => {}` sink, because the sink is stored in a module-level closure and would otherwise leak into subsequent tests.
- The `timestamp` assertion specifically checks `toBeInstanceOf(Date)` (not an ISO string) because the production model stores it as a BSON date for TTL-index and sort-order correctness.
- `coreAuditActions` deliberately tests **only** the three core-owned actions. Domain-specific action strings are pinned in each module's own `src/modules/<name>/tests/unit/audit.test.ts`.
- The "throwing sink" test encodes an invariant: audit emission must never throw back into the request-handling path.
