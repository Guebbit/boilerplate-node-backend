---
source: src/infrastructure/runtime/otel-sdk.ts
sha256: 6931567e7beeef96f0e879a66d6dd0e7968482851c49dc0e933044bf4de1241e
generated_at: 2026-10-29T02:14:52.933651+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/otel-sdk.ts

## Purpose

Bootstraps the OpenTelemetry Node SDK: configures resource identity, span export, auto-instrumentation (HTTP, Express, Mongoose, Redis), and context propagation for the application. Must be imported before any instrumented library handles traffic, because the instrumentation packages monkey-patch modules at `sdk.start()` time.

## Key elements

- **`startTracing()`** — Entry point. Builds the `NodeSDK` (resource, propagator, processors, instrumentations) and calls `sdk.start()`. Idempotent via a module-level `started` flag.
- **`buildProcessors()`** — Returns `[BatchSpanProcessor]` when an OTLP endpoint is configured, otherwise `[NoopSpanProcessor]` (keeps a tracer provider registered so trace-id correlation on logs still works). Exported so tests can construct the real processor without invoking `startTracing()`.
- **`redactUrlSecrets(target)`** — Replaces query-parameter values listed in `traceUrlSecrets` (from shared rules) with `REDACTED`.
- **`publicEndpointPropagator()`** — W3C `inject` only; `extract` is a no-op so untrusted callers cannot graft, force-sample, or inject baggage.
- **`linkInboundTrace(span, request)`** — Parses the caller's `traceparent` against `ROOT_CONTEXT` and adds it as a span *link* (not a parent), preserving correlation without ceding trace control.
- **`onIncomingRequest(span, request)`** — Per-request hook: redacts URL secrets, then links the inbound trace unless `NODE_TRUSTED_INGRESS` is set.
- **`SERVICE_VERSION`** — `package.json` version, stamped as `service.version` on every span.
- **`QUERY_SECRETS`** — Module-level constant loaded from `shared/rules/log-redaction.yaml` via `loadSharedRules`.

## Relationships

- **`src/infrastructure/runtime/config.ts`** — Provides `loggingConfig()` (service name) and `tracingConfig()` (endpoint, `NODE_TRUSTED_INGRESS`). Imported via relative path (`./config`) because this module loads before path-alias resolution is wired.
- **`src/infrastructure/config/shared-rules/load.ts`** — `loadSharedRules()` loads the redaction rule at module init.
- **`src/infrastructure/config/shared-rules/log-redaction.ts`** — Exports `logRedactionSchema`, the Zod schema used to validate the redaction rule.
- **`package.json`** — Imported as JSON for `SERVICE_VERSION`.
- **`src/cluster.ts`** — Cluster workers each import this module in their own process; the `started` guard is per-process, which is the intended behavior.
- **`src/app.ts`** — Imports this module (or the lifecycle wrapper) before the Express app begins handling requests.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Expected caller of `startTracing()` (and any shutdown/flush of the module-scoped `sdk` instance).
- **`tests/unit/infrastructure/runtime/otel-sdk.test.ts`** — Unit tests; relies on the exported `buildProcessors()` to avoid calling `startTracing()` inside a shared Jest worker.

## Notes

- Import order is critical: this module must execute before Express/Mongoose/Redis first touch a request, or those code paths remain un-patched and produce no spans.
- Without an OTLP endpoint the SDK still registers a tracer provider (via `NoopSpanProcessor`); an empty processor list would leave spans as global no-ops and break trace-id correlation on logs/audit rows.
- The propagator strategy is binary: `NODE_TRUSTED_INGRESS` set → standard W3C pair (caller trace becomes parent); unset → inject-only propagator + span link. There is no middle ground.
- `SERVICE_VERSION` reads `package.json` directly rather than using the `npm_package_version` env var, because the production image is not started by npm.
