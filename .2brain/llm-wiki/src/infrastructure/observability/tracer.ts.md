---
source: src/infrastructure/observability/tracer.ts
source_sha256: 7f1a6b134c8803e4a8a4ac38991579093d80a3668ec55eda5ac655d98f35fa58
context_sha256: 8bea2c037fb0d069e65c97a906a2c164352c3412a319cdc07ec5f295a06eb158
generated_at: 2026-11-22T03:01:05.527531+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/tracer.ts

## Purpose
A thin wrapper around the OpenTelemetry API (`@opentelemetry/api`) for creating custom spans. It gives the rest of the codebase a service-scoped tracer, a helper that runs async work inside a span, and a helper that annotates the active span with an error. It imports only the API package, not the SDK. Without a registered SDK every call is a no-op, so tests run without booting OpenTelemetry.

## Key elements
- `getTracer()`: returns `trace.getTracer('boilerplate-node-backend')`. It is called lazily rather than cached in a module constant. That way it never grabs a no-op tracer at import time, before `startTracing()` registers the real provider.
- `withSpan(spanName, callback)`: runs an async callback inside `tracer.startActiveSpan`.
  - The span is current for the duration of the callback, so nested instrumentation attaches as children.
  - On success it sets status `OK` and ends the span.
  - On failure it calls `markSpanFailed`, ends the span, and re-throws the original error. It never swallows errors.
  - The callback runs inside a promise chain, so a synchronous throw still takes the failure path and the span still ends.
  - It uses `.then(onFulfilled, onRejected)` so the span cannot be ended twice.
  - The callback receives the `span` and can set its own attributes.
- `recordErrorOnActiveSpan(error)`: marks the active span (`trace.getActiveSpan()`) as failed without throwing. It does nothing when there is no active span. It deliberately does not call `span.end()`, because the span belongs to whoever opened it, usually the auto-instrumentation's request span.
- `markSpanFailed` (private): sets the `error.type` attribute, sets `ERROR` status with a message, and records an exception event for `Error` instances.

## Relationships
- `@infrastructure/runtime/config`: `isRelaxedEnvironment()` decides how much error detail is recorded.
- `@guebbit/js-toolkit`: `extractErrorMessage` builds the status message in relaxed environments.
- `tests/unit/infrastructure/observability/tracer.test.ts`: the unit tests for this file.
- `src/modules/observability/controllers/get-observability-metrics.ts` and its unit test: neighbors in the dependency graph. The file shows no direct interaction with them.
- `src/app/error-handling.ts`, `src/infrastructure/adapters/logger.ts`, `src/infrastructure/adapters/mailer.ts` and `src/infrastructure/http/errors.ts`: neighbors in the graph. No direct interaction is visible in this file.

## Notes
- **Error redaction.**
  - In relaxed environments (development and test), the status message is the full error message, and `recordException` receives the full `Error`.
  - Elsewhere, only the error `name` is used for the status message and the exception event. The reason is that messages can carry request data, such as the email in a duplicate-key error, and trace backends retain it.
  - `recordException(error)` would also write `exception.stacktrace`, which exposes absolute paths and dependency internals, so only `{ name }` is recorded.
- **Non-`Error` throws.** `error.type` falls back to `typeof error`. Exception events are recorded only for `Error` instances.
- A span that is never ended is never exported. This is why `withSpan` ends it on both paths.
