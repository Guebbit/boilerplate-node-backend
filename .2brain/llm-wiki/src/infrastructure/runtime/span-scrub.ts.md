---
source: src/infrastructure/runtime/span-scrub.ts
sha256: 7f51e4ee8956b968b405a04d0cae57846890593815c63be29422e7ad47691ed5
generated_at: 2026-11-14T18:17:59.161415+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/span-scrub.ts

## Purpose

Wraps an OpenTelemetry span exporter to scrub sensitive error text (`err.message`) from spans before they leave the process. It exists because the Mongoose instrumentation writes `err.message` onto both the span status and `exception` events, and neither the instrumentation's own options nor a Collector-side processor can reliably prevent that leak. This sits at the last chokepoint — the exporter boundary.

## Key elements

- **`scrubbingExporter`** *(exported)* — takes a `SpanExporter` and returns a new one whose `export` maps every span through `scrubSpan` before delegating to the inner exporter. `shutdown` and `forceFlush` are passed through (with a no-op fallback for `forceFlush` if the inner exporter doesn't implement it).
- **`scrubSpan`** *(module-private)* — returns a `Proxy` over the original `ReadableSpan` that intercepts reads of `events` and `status`:
  - `events`: each `exception` event's attributes are reduced to only `exception.type` and `exception.escaped`; non-exception events pass through untouched.
  - `status`: if the code is `ERROR`, `message` is replaced with the `error.type` span attribute, or the first exception event's `exception.type`, or omitted if neither exists.
- **`KEPT_EXCEPTION_ATTRIBUTES`** — the allow-list (`['exception.type', 'exception.escaped']`) controlling which exception-event attributes survive.

## Relationships

- **`src/infrastructure/runtime/otel-sdk.ts`** — the SDK setup that installs `scrubbingExporter` around the real span exporter (e.g., OTLP or console exporter), making every exported span pass through the scrub.
- **`src/modules/account/two-factor/registry.ts`** — a domain module in the same process whose error-path spans are exported through the same pipeline and therefore pass through this scrubber.
- **`tests/unit/infrastructure/runtime/span-scrub.test.ts`** — unit tests covering `scrubSpan` and `scrubbingExporter` behavior.

## Notes

- **Proxy, not spread:** `ReadableSpan` is a class instance whose methods live on the prototype; a plain `{ ...span }` would lose them. The `Proxy` preserves all prototype access while overriding only `events` and `status`.
- **Pass-through for clean spans:** if the span has no `ERROR` status and no events, the original reference is returned as-is (no Proxy overhead).
- **Type widening in the Proxy `get` trap:** `Reflect.get` returns `any`; the code casts to `unknown` intentionally so the value is forwarded unexamined — do not "fix" this to a narrower type without verifying every consumer.
- See `docs/tools/opentelemetry.md` for the broader rationale and deployment context.
