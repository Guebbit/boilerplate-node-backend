---
source: src/infrastructure/runtime/span-scrub.ts
source_sha256: 2f01c430a353006287e85e49d6c0215fb8f2d3e22d5111932b64f6b7fe783d1f
context_sha256: a164d590dbb01e192862de3275855e0fb2e5cb6aa00a4c3b7471510b5ca7ff2e
generated_at: 2026-11-22T03:07:53.977917+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/span-scrub.ts

## Purpose
A span exporter wrapper that keeps an error's type but drops its text on spans recorded by other libraries (e.g. the Mongoose instrumentation, which puts `err.message` on the span status and the exception event). It sits as the last step before a span leaves the process, because an instrumentation's own options can't suppress this, and a Collector processor only protects deployments that run ours.

## Key elements
- `scrubbingExporter(inner)` (exported): wraps a `SpanExporter` so every span passes through `scrubSpan` before reaching `inner.export`. `shutdown` delegates to `inner`; `forceFlush` delegates if `inner` has one, otherwise resolves immediately.
- `scrubSpan(span)` (internal): returns a `ReadableSpan` whose `events` and `status` are replaced:
  - `exception` events keep only `exception.type` and `exception.escaped` attributes. Other events are untouched.
  - For error-status spans, the status message becomes the error's type: the `error.type` attribute, else the first exception event's `exception.type`. If neither is a string, there is no message.
  - Spans that are not in error status and have no events are returned unchanged.
- `KEPT_EXCEPTION_ATTRIBUTES`: the allow-list of exception event attributes.

## Relationships
- `src/infrastructure/runtime/otel-sdk.ts` and `src/modules/account/two-factor/registry.ts` are graph neighbors. The file itself does not import either, so any link would be through callers, which this file doesn't show. `otel-sdk.ts` is presumably where the exporter is composed.
- `tests/unit/infrastructure/runtime/span-scrub.test.ts` is the unit test for this module.

## Notes
- The result is a `Proxy` over the original span, not a spread copy. A `ReadableSpan` is a class instance with its methods on the prototype, which a spread would drop. Only `events` and `status` are overridden; all other properties pass through via `Reflect.get`.
- The allow-list is an allow-list, not a deny-list. Any exception attribute not named in it (including `exception.message` and `exception.stacktrace`) is dropped.
- Scrubbing applies to span events named `exception` and to the status only. Other span attributes are not touched, apart from `error.type` being read.
- The scrubbed status is rebuilt with only `code` plus an optional `message`. For non-error statuses, no message is kept.
