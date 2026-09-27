---
source: tests/unit/infrastructure/observability/audit.test.ts
sha256: 56d821fdb1be0c6fc7c682c745582d77a2efa9df6e01b21d7a43b378ef48590c
generated_at: 2026-09-27T16:08:48.739056+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/audit.test.ts

## Purpose

Unit tests for the core audit-logging pipeline (`audit.ts`). Verifies that audit events are emitted at the correct log level, that custom sinks receive properly-shaped entries, that request-context extraction and actor-role resolution work as specified, and that a broken sink never propagates an exception into the request path.

## Key elements

- **`coreAuditActions` block** – Asserts the three app-level security action strings (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`) that `core` owns independently of any domain module.
- **`emitAuditEvent` block** – Confirms success → `info`, failure / `security.unauthorized` → `warn`, and that all event fields (target, trace, metadata) pass through untouched to `auditLogger.log`.
- **`registerAuditSink` block** – Verifies the sink receives an `AuditEntry` with a real `Date` timestamp and an outcome-derived `level`; that the log line is still written when no sink is active; and that a throwing sink is caught, logged via `auditLogger.warn('audit.sink.failed', { error })`, and does not reach the caller.
- **`extractRequestContext` block** – Checks extraction of `ip`, `user_agent`, `request_id`, and that `trace_id` is `undefined` outside an active OTel span.
- **`buildAuditEvent` default-actor-role block** – Guards the three-tier role resolution: `anonymous` (no id), `user` (partial key set), `admin` (unrestricted caller holding every scope key).

## Relationships

- **`src/infrastructure/observability/audit.ts`** – The module under test. All exported symbols (`buildAuditEvent`, `emitAuditEvent`, `extractRequestContext`, `registerAuditSink`, `coreAuditActions`, types) are imported and exercised here.
- **`src/infrastructure/adapters/logger.ts`** – Provides `auditLogger`, whose `log` and `warn` methods are spied on at module scope to prevent real disk writes and to assert call signatures.
- **`tests/support/callers.ts`** – Supplies `strangerCaller`, `testCallerContext`, and `callerContextAs(scope, id)` factories used to construct realistic caller contexts without a live server.

## Notes

- `auditLogger.log`/`warn` are spied on **before** any test runs (module-level `jest.spyOn`), so every test inherits the mock; individual blocks call `jest.clearAllMocks()` in `beforeEach` to reset call counts.
- `registerAuditSink` stores the sink in a **module-level closure**. The `afterEach` in that block reinstalls a no-op sink; forgetting this causes one test's sink to receive the next test's events.
- The timestamp assertion (`toBeInstanceOf(Date)`) is intentional: the persisted `AuditEntry` uses a BSON date so the TTL index and `timestamp: -1` sort operate on a real date, not lexicographic string order.
- The throwing-sink test asserts that `auditLogger.warn` receives the **Error object** (not `.message`), because downstream `redactFormat`/`serializeError` relies on the object to extract name and stack.
- The `admin` actor-role test documents a regression guard: before `unrestricted` was added to `Caller`, `resolveActorRole` could not distinguish admin from regular user, logging admin actions as `user`.
