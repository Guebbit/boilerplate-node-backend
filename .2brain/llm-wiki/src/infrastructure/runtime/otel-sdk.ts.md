---
source: src/infrastructure/runtime/otel-sdk.ts
sha256: 97b34f9a892b400dfa814979734d015cfd5c7bf40b93a70b5acd4d8785563469
generated_at: 2026-10-14T08:14:18.814430+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/otel-sdk.ts

## Purpose

Bootstraps the OpenTelemetry Node SDK with auto-instrumentation (HTTP, Express, Mongoose, Redis), OTLP span export, and trace-context propagation. It must be imported *before* any instrumented library handles traffic, because instrumentation patches global modules at `sdk.start()` time. The module also enforces two security properties: sensitive query parameters are redacted from span URLs, and public endpoints never adopt an inbound trace id (to prevent trace hijacking and forced sampling).

## Key elements

- **`startTracing()`** – Idempotent entry point. Builds the `NodeSDK` with resource attributes, span processors, propagator, and four auto-instrumentations, then calls `sdk.start()`. A module-level `started` flag prevents double-patching.
- **`buildProcessors()`** – Returns a `BatchSpanProcessor` (OTLP HTTP exporter) when an OTLP endpoint is configured, or a `NoopSpanProcessor` otherwise. Exported so tests can construct the real processor without triggering `sdk.start()`.
- **`publicEndpointPropagator()`** – Returns a `TextMapPropagator` that *injects* `traceparent` on outgoing calls but *never* extracts an inbound one, preventing callers from controlling this service's trace id or baggage.
- **`trustedIngressPropagator()`** (private) – Standard W3C Trace Context + Baggage composite, used when `NODE_TRUSTED_INGRESS` is set so the caller's trace continues as parent.
- **`linkInboundTrace()`** – Extracts a valid span context from an inbound `traceparent` header and adds it as a *span link* (correlation without adoption).
- **`redactUrlSecrets()`** – Replaces the values of query params listed in `QUERY_SECRETS` (`code`, `state`) with `REDACTED`.
- **`onIncomingRequest()`** (private) – The `requestHook` passed to `HttpInstrumentation`; redacts URL secrets on the span, then links the caller's trace unless a trusted ingress already made it the parent.
- **`QUERY_SECRETS`** – `['code', 'state']`, the OAuth callback params that must never appear in clear in span attributes.
- **`sdk`** – Module-scoped singleton holding the running `NodeSDK` instance, accessible to `shutdownTracing()` for clean flush.

## Relationships

- **`src/infrastructure/runtime/config.ts`** – Imports `loggingConfig` (service name) and `tracingConfig` (service version, OTLP endpoint, `NODE_TRUSTED_INGRESS`, `npm_package_version`). Relative import used because this file loads before path-alias resolution is available.
- **`src/app.ts`** – Imports `startTracing` to bootstrap instrumentation before the Express app begins serving requests.
- **`src/cluster.ts`** – Each cluster worker process imports and calls `startTracing` independently; the `started` guard is per-process by design.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Calls the shutdown path (flush + `sdk.shutdown()`) during graceful process exit.
- **`tests/unit/infrastructure/runtime/otel-sdk.test.ts`** – Exercises `redactUrlSecrets`, `buildProcessors`, and propagator behavior without invoking the full `sdk.start()` monkey-patch.

## Notes

- **Import order matters.** This module must be the first thing imported in any entry point that will serve traffic; anything already loaded runs un-patched and emits no spans.
- **`redactedQueryParams` is not used.** The HTTP instrumentation's built-in `redactedQueryParams` option only covers *outgoing* requests; incoming secrets are handled via the `requestHook` (`onIncomingRequest`) instead.
- **No-endpoint fallback is intentional.** When no OTLP endpoint is set, spans are created (so log/audit correlation still works) but dropped by `NoopSpanProcessor` rather than failing to export.
- **Semantic-convention attribute keys** (`ATTR_SERVICE_NAME`, `ATTR_SERVICE_VERSION`) are used instead of raw strings to stay aligned with the OTel spec that tracing backends rely on for grouping.
- **`@opentelemetry/sdk-trace`** (not `-node`) is the source for `BatchSpanProcessor`/`NoopSpanProcessor`; the `-node` package now only re-exports it.
