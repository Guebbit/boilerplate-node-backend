---
source: tests/unit/infrastructure/observability/audit.test.ts
sha256: 90dc7cb5381ffd0210acba85c3566268821a9d1b1171c5a6ba0d533190808583
generated_at: 2026-09-23T20:24:54.667543+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/audit.test.ts

## Purpose
Unit tests for the core audit-event pipeline. Verifies that `emitAuditEvent` selects the correct log level and forwards all fields, that the registered-sink pattern delivers stamped entries without letting sink failures escape into the request path, that `extractRequestContext` and `buildAuditEvent` produce the expected shapes, and that the three app-level security actions carry stable string values.

## Key elements
- **`coreAuditActions` assertions** — pins the three core-owned strings (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`). Domain-specific actions are tested in each module's own audit test file.
- **`emitAuditEvent` suite** — asserts `auditLogger.log` is called with `"info"` for success, `"warn"` for failure/security events; verifies full field passthrough (action, actor, target, trace, metadata).
- **`registerAuditSink` suite** — confirms a registered sink receives an `AuditEntry` with a `Date` timestamp and outcome-derived level; log line is still written when the sink is inert; a throwing sink is caught and reported via `auditLogger.warn('audit.sink.failed', { error })` without re-throwing.
- **`extractRequestContext` suite** — checks `ip`, `user_agent`, `request_id` are pulled from the caller context; `trace_id` is `undefined` without an active OTel span.
- **`buildAuditEvent` (default actor_role) suite** — verifies `anonymous` → no id, `user` → authenticated with partial scope, `admin` → authenticated with every key its scope declares.

## Relationships
- **`src/infrastructure/observability/audit.ts`** — the module under test; all exported functions and types are imported and exercised directly.
- **`src/infrastructure/adapters/logger.ts`** — `auditLogger.log` and `auditLogger.warn` are spied on (mocked to return the logger itself) so tests never write to disk; call signatures and arguments are asserted against the mock.
- **`tests/support/callers.ts`** — provides `strangerCaller()`, `testCallerContext`, and `callerContextAs(scope, id)` fixtures used to build realistic caller contexts without depending on a live auth stack.

## Notes
- The sink lives in a module-level closure, so every test in the `registerAuditSink` block must call `registerAuditSink(() => {})` in `afterEach` to prevent the next test's events from leaking into the previous sink.
- `entry.timestamp` is asserted with `toBeInstanceOf(Date)` (not an ISO string) — this is intentional for the BSON TTL index and `timestamp: -1` sort.
- The throwing-sink test asserts the **Error object itself** (not `.message`) is passed to `auditLogger.warn`, because `redactFormat` hands it to `serializeError`, which preserves name and (outside production) stack.
- `trace_id` will always be `undefined` in unit tests; OTel SDK is not initialised in the Jest environment.
