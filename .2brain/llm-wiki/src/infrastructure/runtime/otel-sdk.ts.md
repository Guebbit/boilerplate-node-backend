---
source: src/infrastructure/runtime/otel-sdk.ts
sha256: f224c14441dcdd29ccdbaca7b568d5f1402cbaf13bc09691bdea8112b76601b4
generated_at: 2026-09-27T14:15:22.974282+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/otel-sdk.ts

## Purpose

Bootstraps the OpenTelemetry SDK for this Node process. It wires up resource identity, a batch OTLP span export pipeline, and auto-instrumentations for the four libraries the app uses (HTTP, Express, Mongoose, Redis). Because the instrumentation packages monkey-patch their target modules at `sdk.start()` time, this module **must** be imported before any of those libraries begin handling traffic; otherwise already-loaded code paths stay un-patched and produce no spans.

## Key elements

- **`redactUrlSecrets(target)`** – Exported pure helper. Replaces the values of `code` and `state` query params with `REDACTED` so OAuth secrets never appear in span URL attributes.
- **`redactIncomingUrl(span, request)`** – Internal. Called via `HttpInstrumentation`'s `requestHook`; overwrites both `http.target`/`http.url` (v1) and `url.query` (v2) span attributes when the query carries a secret.
- **`buildProcessors()`** – Exported. Returns `[BatchSpanProcessor + OTLPTraceExporter]` when `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (or the generic endpoint) is set, otherwise `[NoopSpanProcessor]` so the SDK still registers a tracer provider and spans carry a trace id for log/audit correlation. Exported separately so tests can build the real processor without triggering global monkey-patching.
- **`startTracing()`** – Exported, idempotent. Creates the `NodeSDK` with resource, processors, and the four instrumentations, then calls `sdk.start()`. A module-level `started` flag prevents double-registration in cluster workers (each gets its own process-local flag).
- **`shutdownTracing()`** – Exported. Calls `sdk.shutdown()` to flush the `BatchSpanProcessor`'s in-memory queue. Intended to run last in the shutdown chain so teardown work is still traced.
- **`sdk` / `started`** – Module-scope singletons. `sdk` holds the live `NodeSDK` instance; `started` is the idempotency guard.

## Relationships

- **`src/app.ts`** – Imports `startTracing` (and possibly `redactUrlSecrets`) before Express/mongoose/redis start serving, ensuring the patches are in place before the first request.
- **`src/cluster.ts`** – Spawns worker processes; each worker independently imports this module and calls `startTracing()`, relying on the per-process `started` flag to stay idempotent.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Calls `shutdownTracing()` as the final step in the graceful-shutdown sequence so the last batch of spans is flushed before the process exits.
- **`tests/unit/infrastructure/runtime/otel-sdk.test.ts`** – Exercises `redactUrlSecrets` and `buildProcessors` (and potentially the redaction hook) without calling `startTracing`, since that would monkey-patch globals inside a shared Jest worker.

## Notes

- Import **order matters**: this file must be the first thing imported in the process before any of express, mongoose, or redis are loaded. A late import silently produces no spans for those libraries.
- `buildProcessors` reads the endpoint and headers from the standard `OTEL_EXPORTER_OTLP_*` env vars (the exporter handles header parsing/percent-decoding per the OTLP spec); there is no manual URL or header construction here.
- The `NoopSpanProcessor` fallback is deliberate: an empty `spanProcessors` array would cause the SDK to skip registering a TracerProvider entirely, turning all spans into no-ops and losing the trace-id correlation that logs and audit rows depend on.
- Only the four instrumentations the app actually uses are loaded, rather than the `@opentelemetry/auto-instrumentations-node` bundle, to keep startup cost lower.
- `QUERY_SECRETS` is hardcoded to `['code', 'state']`; adding a new OAuth flow param requires updating this list.
