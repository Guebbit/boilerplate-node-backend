# src/infrastructure/runtime/otel-sdk.ts

## Purpose

Bootstraps the OpenTelemetry `NodeSDK` for this process: wires up resource identity, the OTLP batch exporter, and auto-instrumentations for HTTP, Express, Mongoose, and Redis. It must be imported *before* any of those libraries begin handling traffic, because the instrumentation packages monkey-patch their targets at `sdk.start()` time — code that is already loaded stays un-patched and emits no spans.

## Key elements

- **`startTracing()`** (exported) — Idempotent entry point. Builds a `NodeSDK` with a resource (`service.name`, `service.version`), a span-processor pipeline, and the four instrumentations, then calls `sdk.start()`. Safe to call multiple times; guarded by the `started` flag.
- **`shutdownTracing()`** (exported) — Flushes the `BatchSpanProcessor` queue and calls `sdk.shutdown()`. Returns `Promise<void>`; resolves immediately if the SDK was never started.
- **`buildProcessors()`** (module-private) — Reads `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` to construct a `BatchSpanProcessor` + `OTLPTraceExporter`. Returns `[]` when no endpoint is set (spans are created but discarded).
- **`sdk` / `started`** (module-scope variables) — Single SDK instance and per-process idempotency guard.

## Relationships

- **`src/app.ts`** — Imports `startTracing()` before the Express app begins listening, ensuring the HTTP/Express/Mongoose/Redis patches are in place before the first request.
- **`src/cluster.ts`** — Each cluster worker process imports this module independently; the `started` flag is per-process, so workers instrument themselves without cross-process coordination.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Calls `shutdownTracing()` as the final step in the shutdown sequence so that infrastructure teardown spans are still flushed before the process exits.

## Notes

- **Import order is critical.** If this module is loaded after Express or Mongoose have already been required, those libraries remain un-patched for the lifetime of the process.
- **No-op mode by default.** Without `OTEL_EXPORTER_OTLP_ENDPOINT` the SDK still runs (spans exist, `traceId` is available for log correlation) but nothing is exported. This keeps local dev and test output quiet without a collector.
- **Header parsing is manual.** `OTEL_EXPORTER_OTLP_HEADERS` is split on `,` then on `=`; there is no support for quoted values or empty keys beyond the destructuring defaults.
- **Version source.** `service.version` reads `npm_package_version` (auto-injected by npm scripts) and falls back to `'0.0.0'`; in a bare `node` invocation it will be `'0.0.0'`.
