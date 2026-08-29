# src/infrastructure/runtime/otel-sdk.ts

## Purpose

Bootstraps the OpenTelemetry `NodeSDK` for the application: configures service identity, batch OTLP span export, and auto-instrumentation for HTTP, Express, Mongoose, and Redis. Exposes a start/shutdown pair so the rest of the codebase never touches OTel APIs directly.

## Key elements

- **`startTracing(): void`** — Idempotent entry point. Builds a `NodeSDK` with a resource (`service.name` from `NODE_SERVICE_NAME`, `service.version` from `npm_package_version`), the span-processor pipeline, and four instrumentations, then calls `sdk.start()` to apply monkey-patches.
- **`shutdownTracing(): Promise<void>`** — Calls `sdk.shutdown()` to flush any spans still queued in the `BatchSpanProcessor`. Resolves immediately if `startTracing` was never called.
- **`buildProcessors(): SpanProcessor[]`** — Returns `[]` (no-op) when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset; otherwise returns a `BatchSpanProcessor` wrapping an `OTLPTraceExporter` pointed at `<endpoint>/v1/traces` with optional headers from `OTEL_EXPORTER_OTLP_HEADERS`.
- **`sdk` / `started`** — Module-scope singletons. `started` guards against double-registration of instrumentations; `sdk` holds the instance so `shutdownTracing` can flush the same object.

## Relationships

- **`src/infrastructure/runtime/server-lifecycle.ts`** — Calls `shutdownTracing()` as the final step in the shutdown chain so infra teardown is still traced and pending spans are not lost.
- **`src/cluster.ts`** — Each cluster worker imports this module in its own process; the `started` flag is intentionally per-process so every worker instruments independently.
- **`src/infrastructure/observability/tracer.ts`** — Consumes the context/span created by this module's instrumentations (e.g. reads `traceId` for log correlation, or opens manual child spans).
- **`src/app.ts`** — Must import this module *before* Express begins handling requests; otherwise the HTTP/Express patches land after the server is live and early requests produce no spans.

## Notes

- **Import order is a hard requirement.** The instrumentation packages patch target modules at `sdk.start()` time. Any library that has already processed traffic stays un-patched for that process's lifetime.
- **`OTEL_EXPORTER_OTLP_ENDPOINT` is a base URL only** (e.g. `http://localhost:4318`); the `/v1/traces` path is appended internally.
- **No endpoint → silent mode.** The SDK still runs and `traceId` is available in the context, but zero spans are exported. This is the expected local-dev / test behavior.
- **`OTEL_EXPORTER_OTLP_HEADERS`** uses the OTel-specified `key=value,key2=value2` format; it is parsed into a `Record<string, string>` before being handed to the exporter.
- **Version stamping depends on npm.** `npm_package_version` is only injected when the process is started via an npm script (`npm start`, etc.). A bare `node dist/…` launch falls back to `'0.0.0'`.
