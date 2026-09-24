---
source: src/infrastructure/runtime/otel-sdk.ts
sha256: 8704245173459ce36d7d42d8612ae8964cc1a4335bab7bcd872a3d0f75b29a72
generated_at: 2026-09-23T17:52:11.801936+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/otel-sdk.ts

## Purpose

Bootstrap for the OpenTelemetry Node SDK. Must be imported **before** any instrumented library (Express, Mongoose, Redis, Node http) begins handling traffic, because the instrumentation packages monkey-patch their target modules at `sdk.start()` time. Without early import, already-running code keeps the un-patched path and emits no spans.

## Key elements

- **`buildProcessors()`** — Returns a `SpanProcessor[]`. Reads `OTEL_EXPORTER_OTLP_ENDPOINT`; if absent, returns `[]` (no-op mode: spans created but not shipped). Otherwise returns a single `BatchSpanProcessor` wrapping an `OTLPTraceExporter` pointed at `{endpoint}/v1/traces`, with optional headers parsed from `OTEL_EXPORTER_OTLP_HEADERS`. Exported separately so tests can build the processor without invoking the global-patching `startTracing()`.
- **`startTracing()`** — Idempotent (guarded by a module-level `started` boolean). Constructs a `NodeSDK` with: a `resource` carrying `ATTR_SERVICE_NAME` (from `NODE_SERVICE_NAME`, default `"api"`) and `ATTR_SERVICE_VERSION` (from `npm_package_version`, default `"0.0.0"`); the processor array from `buildProcessors()`; and four auto-instrumentations (`HttpInstrumentation`, `ExpressInstrumentation`, `MongooseInstrumentation`, `RedisInstrumentation`). Calls `sdk.start()` to apply patches and begin the batch-flush timer.
- **`shutdownTracing()`** — Awaits `sdk.shutdown()` to flush pending spans held in the `BatchSpanProcessor` queue. Resolves immediately if `startTracing()` was never called.
- **Module-scope `sdk`** — Single `NodeSDK | undefined` instance shared between start and shutdown.

## Relationships

- **`src/app.ts`** — Imports this module (or `startTracing`) at the top of the Express app setup so instrumentation patches are in place before the first request is handled.
- **`src/cluster.ts`** — In cluster mode each worker process imports this module independently; the `started` flag is per-process, so every worker runs its own SDK instance without double-registering.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Orchestrates graceful shutdown and calls `shutdownTracing()` as the final step, after infra teardown, so the teardown itself is still traced and buffered spans are flushed before the process exits.
- **`tests/unit/infrastructure/runtime/otel-sdk.test.ts`** — Exercises `buildProcessors()` (exported specifically so tests avoid triggering `startTracing()`, which would monkey-patch globals in a shared Jest worker).

## Notes

- **Import order is load-bearing.** The file's docblock explicitly warns: import before any instrumented library processes traffic. A late import silently produces zero spans with no error.
- **No-op mode is intentional.** Without `OTEL_EXPORTER_OTLP_ENDPOINT` the SDK still runs, `traceId` is available for log correlation, but nothing is exported. This keeps local dev and CI quiet without a collector.
- **Header parsing is manual.** `OTEL_EXPORTER_OTLP_HEADERS` (comma-separated `key=value` pairs) is split and trimmed by hand into a `Record<string, string>`; there is no library helper for this format.
- **Only four instrumentations are loaded** rather than the `@opentelemetry/auto-instrumentations-node` bundle, to limit startup cost to libraries the app actually uses.
- **`BatchSpanProcessor` import source.** Pulled from `@opentelemetry/sdk-trace` (not the deprecated `sdk-trace-base`), and takes a single options object — the two-argument form no longer exists.
