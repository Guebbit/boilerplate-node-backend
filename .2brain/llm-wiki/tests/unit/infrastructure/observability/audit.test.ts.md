---
source: tests/unit/infrastructure/observability/audit.test.ts
sha256: c7546a4005871ed5b2706c245511467b4cf218335595fd988fda47241d9f2a45
generated_at: 2026-11-08T10:20:42.989453+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/audit.test.ts

## Purpose

Unit-test suite for the audit observability module. It verifies that audit events are built with the correct actor metadata, emitted at the right log level, handed to a registered sink with a proper `Date` timestamp, and that a broken sink can never crash the calling request path.

## Key elements

- **`coreAuditActions` block** – asserts the three app-level security action strings (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`) that core owns.
- **`emitAuditEvent` block** – confirms `auditLogger.log` is called with `info` (success) or `warn` (failure / security) and that all event fields pass through intact.
- **`registerAuditSink` block** – verifies the sink receives a populated `AuditEntry`, that `timestamp` is a `Date` instance (not a string), that the log line is still written when no sink is registered, and that a throwing sink is caught and reported via `auditLogger.warn('audit.sink.failed', …)` without propagating.
- **`extractRequestContext` block** – checks extraction of `ip`, `userAgent`, `requestId` from a request object; `traceId` is expected `undefined` (no OTel span in tests).
- **`buildAuditEvent` – clientRequestId block** – asserts `clientRequestId` is merged into `metadata` alongside caller-supplied keys, and that no `metadata` property is added when the caller sent none.
- **`buildAuditEvent` – default actorRole block** – pins the resolution order: `anonymous` → `user` → `admin` → `system`. The `system` case (`id: 'system'`) must be checked before `admin` because both carry unrestricted scope.

## Relationships

- **`src/infrastructure/observability/audit.ts`** – the module under test. All exported functions (`buildAuditEvent`, `emitAuditEvent`, `extractRequestContext`, `registerAuditSink`), the `coreAuditActions` constant, and the `AuditEvent` / `AuditEntry` types are imported here.
- **`src/infrastructure/adapters/logger.ts`** – provides the singleton `auditLogger`. The test file spies on its `log` and `warn` methods at module load time to prevent real disk writes and to capture call arguments.
- **`tests/support/callers.ts`** – supplies the test-fixture helpers `strangerCaller`, `testCallerContext`, and `callerContextAs` used to construct various caller shapes (anonymous, user-scoped, admin-scoped, system).

## Notes

- **Sink is closure-held.** `registerAuditSink` stores the callback in module-level state, so the `afterEach` in the sink block resets it to a no-op; without this, a later test's `emitAuditEvent` call would invoke the previous test's sink.
- **`timestamp` must be a `Date`.** The comment in the source notes this is intentional: the downstream store uses a BSON date so the TTL index and `timestamp: -1` sort operate on real dates rather than lexicographic strings.
- **`system` before `admin`.** Both roles are unrestricted, but `resolveActorRole` checks the `system` id first. The test with `callerContextAs('system', 'system')` guards against a regression where a background job's audit entry would be mislabelled as `admin`.
- **`traceId` is `undefined` in tests.** It is derived from the active OpenTelemetry span; the unit-test environment has no SDK active, so the field is simply absent.
