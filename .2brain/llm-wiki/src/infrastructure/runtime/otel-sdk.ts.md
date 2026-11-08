---
source: src/infrastructure/runtime/otel-sdk.ts
sha256: 6931567e7beeef96f0e879a66d6dd0e7968482851c49dc0e933044bf4de1241e
generated_at: 2026-11-08T03:47:11.426803+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/otel-sdk.ts

## Purpose

Bootstraps the OpenTelemetry `NodeSDK` for the application: configures resource attributes, the OTLP (or no-op) span-export pipeline, text-map propagators, and auto-instrumentations for HTTP, Express, Mongoose, and Redis. It also enforces URL-secret redaction and caller-trace linking on incoming request spans. The file **must be imported before any instrumented library handles traffic**, because the instrumentation packages patch their target modules at `sdk.start()` time.

## Key elements

- **`startTracing()`** — Idempotent entry point. Builds the `NodeSDK` with resource, propagator, processors, and instrumentations, then calls `sdk.start()`. Guarded by a module-level `started` flag (per-process, safe under cluster workers).
- **`buildProcessors()`** — Returns `[BatchSpanProcessor(OTLPTraceExporter)]` when a traces endpoint is configured, otherwise `[NoopSpanProcessor]` (spans are still created so logs/audit rows retain a trace id). Exported so tests can build the processor without triggering global monkey-patching.
- **`publicEndpointPropagator()`** — Injects `traceparent` on outgoing calls but is a **no-op on extract**; prevents any unauthenticated caller from adopting/grafting a trace or injecting baggage.
- **`trustedIngressPropagator()`** (private) — Standard W3C Trace Context + Baggage propagator, used when `NODE_TRUSTED_INGRESS` is set.
- **`linkInboundTrace(span, req)`** — Parses the caller's `traceparent` into an isolated context and adds it as a **span link** (correlation without control).
- **`redactUrlSecrets(target)`** — Replaces any query-param named in `traceUrlSecrets` (from shared rules) with the literal string `REDACTED`.
- **`redactIncomingUrl(span, req)`** (private) — Overwrites `http.target`, `http.url`, and `url.query` attributes on the span when redaction is needed.
- **`onIncomingRequest(span, req)`** (private) — The `requestHook` passed to `HttpInstrumentation`; calls `redactIncomingUrl` then conditionally `linkInboundTrace`.
- **`SERVICE_VERSION`** — `packageJson.version`, stamped as `service.version` on every span.
- **`sdk` / `started`** (module-level) — Single SDK instance and idempotency guard, kept at module scope so `shutdownTracing()` (in `server-lifecycle.ts`) can flush the same object.

## Relationships

- **`src/infrastructure/runtime/config.ts`** — Provides `loggingConfig` (service name) and `tracingConfig` (endpoint, `NODE_TRUSTED_INGRESS`). Imported via relative path because this file loads before path-alias resolution is available.
- **`package.json`** — Read for `version` → `SERVICE_VERSION`.
- **`src/infrastructure/config/shared-rules/load.ts`** — `loadSharedRules('log-redaction', …)` supplies the list of secret query-param names.
- **`src/infrastructure/config/shared-rules/log-redaction.ts`** — `logRedactionSchema` used to validate the shared-rules document.
- **`src/cluster.ts`** — Each cluster worker is a separate process that imports this module independently; the `started` flag is intentionally per-process.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Calls `startTracing()` during boot and `shutdownTracing()` during graceful shutdown (accessing the module-scope `sdk`).
- **`src/app.ts`** — Imports this module (or its caller does) before Express/Mongoose/Redis begin handling traffic.
- **`tests/unit/infrastructure/runtime/otel-sdk.test.ts`** — Unit tests; rely on `buildProcessors()` being exported to avoid calling `startTracing()` in a shared Jest worker.

## Notes

- **Import order is critical.** Importing this file after an instrumented library has already loaded means that library's code path is unpatched and produces no spans.
- **No OTLP endpoint ≠ no processor.** An empty processor list would cause the SDK to register no `TracerProvider` at all, making every span a no-op and breaking trace-id correlation in logs/audit rows. The `NoopSpanProcessor` keeps spans alive.
- **`redactedQueryParams` (HttpInstrumentation option) only covers *outgoing* requests.** Incoming redaction is handled exclusively by the `requestHook` → `onIncomingRequest` path.
- **`SERVICE_VERSION` is read from `package.json` directly**, not from the `npm_package_version` env var, because the production container image has no npm runtime.
- **`buildProcessors` is deliberately exported** so tests can construct the real processor in isolation without the global side-effects of `sdk.start()`.
