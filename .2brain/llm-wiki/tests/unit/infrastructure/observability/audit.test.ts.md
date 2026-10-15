---
source: tests/unit/infrastructure/observability/audit.test.ts
sha256: c7546a4005871ed5b2706c245511467b4cf218335595fd988fda47241d9f2a45
generated_at: 2026-10-15T13:17:24.820474+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/audit.test.ts

## Purpose

Unit tests for the audit-logging module (`@infrastructure/observability/audit`). They verify that `emitAuditEvent` picks the correct log level and forwards all event fields, that `registerAuditSink` stamps entries with a real `Date` and isolates sink failures from the request path, that `buildAuditEvent` resolves the actor role correctly (including the `system`-before-`admin` ordering), and that `extractRequestContext` / `coreAuditActions` expose the expected shapes.

## Key elements

- **Module-level spies** — `auditLogger.log` and `auditLogger.warn` are mocked before any test runs so nothing hits disk.
- **`coreAuditActions` block** — asserts the three fixed security action strings (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`).
- **`emitAuditEvent` block** — checks `info` vs `warn` level selection by `outcome`, full field passthrough (including `metadata`, `traceId`), and that security actions force `warn`.
- **`registerAuditSink` block** — verifies sink receives an `AuditEntry` with a `Date` timestamp, that the log line still fires when no sink is registered, and that a throwing sink is caught and reported via `auditLogger.warn('audit.sink.failed', …)` without propagating.
- **`extractRequestContext` block** — confirms `ip`, `userAgent`, `requestId` extraction and that `traceId` is `undefined` without an active OTel span.
- **`buildAuditEvent` — caller's own request id** — `clientRequestId` is merged into `metadata`; absent when the caller sends none.
- **`buildAuditEvent` — default actorRole** — regression guards for `anonymous` → `user` → `admin` → `system` resolution, explicitly checking that `system` is identified *before* `admin` (both are unrestricted).

## Relationships

- **`src/infrastructure/observability/audit.ts`** — the module under test; every function and type imported here comes from it.
- **`src/infrastructure/adapters/logger.ts`** — supplies `auditLogger`, which is spied on to intercept and assert log-level/argument behaviour without writing to disk.
- **`tests/support/callers.ts`** — provides the `strangerCaller`, `testCallerContext`, and `callerContextAs` fixtures used to construct realistic caller shapes for `extractRequestContext` and `buildAuditEvent` tests.

## Notes

- `registerAuditSink` stores its callback in a module-level closure; every test in that block must restore an inert sink in `afterEach` (`registerAuditSink(() => {})`) or subsequent tests will leak events into the wrong sink.
- The `system`-actor test is a deliberate regression guard: `Caller.system` is unrestricted just like `admin`, so the role-resolver must check for `system` first or background-job actions get mislabelled as `admin`.
- `timestamp` is asserted as `instanceof Date` (not an ISO string) because the persistence layer relies on a BSON date for the TTL index and sort order.
- The throwing-sink test asserts the original `Error` object is forwarded (not `.message`), because `redactFormat` → `serializeError` expects an `Error` to preserve name/stack outside production.
