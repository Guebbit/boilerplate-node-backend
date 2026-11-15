---
source: src/infrastructure/observability/span-context.ts
sha256: 3ae996a4652bf97b976de6061f80d5a57e9d4dee204bc553fb3512d1f5eb0400
generated_at: 2026-11-14T18:12:17.920438+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/span-context.ts

## Purpose

Provides a single function that reads the currently active OpenTelemetry span's trace and span IDs from the async context, so that log lines, audit rows, and analytics events can all stamp the same correlation IDs without threading a span object through every call site.

## Key elements

- **`getActiveSpanContext()`** (exported) — Returns `{ traceId: string | undefined; spanId: string | undefined }`. Reads `trace.getActiveSpan()` from OTel's `AsyncLocalStorage`, extracts the wire-propagatable IDs, and replaces invalid (all-zeros) values with `undefined`.
- **`isValidOtelId()`** (internal) — Rejects empty strings and all-zeros hex IDs (`/^0+$/`), which OTel uses for no-op or invalid spans. Prevents meaningless IDs from leaking into output.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `getActiveSpanContext` to attach `traceId`/`spanId` to every log line it writes.
- **`src/infrastructure/observability/audit.ts`** — Consumes the same context so audit rows carry the request's `traceId`.
- **`src/infrastructure/observability/analytics/index.ts`** — Consumes the same context so analytics events are correlated to the request.
- **`tests/unit/infrastructure/observability/tracer.test.ts`** — Unit-tests the span-context behavior (valid spans, no-active-span, all-zeros edge case).

## Notes

- **Minimal dependencies by design.** The module's only import is `@opentelemetry/api`. This is intentional: it sits on jest's `globalSetup` import chain, so pulling in heavier modules would break test bootstrapping.
- **All-zeros IDs are normalized to `undefined`.** In environments where the OTel SDK hasn't started (unit tests, early startup), `getActiveSpanContext()` returns `{ traceId: undefined, spanId: undefined }` rather than a string of zeros that looks like real data.
- **Async-context based.** Because OTel uses `AsyncLocalStorage` internally, any code in the same async call chain can call `getActiveSpanContext()` without an explicit span parameter—this is the mechanism that lets independent signals (logs, audits, analytics) correlate to one trace.
