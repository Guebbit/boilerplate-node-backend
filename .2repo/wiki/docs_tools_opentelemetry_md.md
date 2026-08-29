# docs/tools/opentelemetry.md

## Purpose

Documentation page for the OpenTelemetry (OTel) **trace** layer of the boilerplate. It explains the auto-instrumentation setup (no per-request code), the OTel Collector pipeline, environment-variable configuration, and how `trace_id` is automatically correlated between OTel spans and Winston log lines.

## Key elements

- **Auto-instrumentation table** — maps four libraries (HTTP, Express, Mongoose, Redis) to their `@opentelemetry/instrumentation-*` npm packages and the spans each produces.
- **`startTracing()`** — the single call in `src/infrastructure/runtime/otel-sdk.ts`, invoked at the top of `src/app.ts` before any instrumented imports.
- **Env-var table** — `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `NODE_SERVICE_NAME` and their effects on export behaviour and service naming.
- **Mermaid flowchart** — Client → OTel SDK → (Express / Mongoose / Redis) → OTel Collector → Tempo → Grafana.
- **OTel Collector config pointer** — `.docker/observability/otel-collector.config.yaml`; receives OTLP on `:4318`/`:4317`, batches, exports to Tempo via OTLP/gRPC.
- **Trace ↔ log correlation section** — step-by-step walkthrough of how the active OTel context is read by Winston so every log line carries `trace_id` with zero manual code.
- **"Works with" section** — cross-links to Winston, MongoDB/Mongoose, Redis Cache, and Tempo with a one-line note on what each contributes to the trace.

## Relationships

- **`docs/tools/observability-reference.md`** — explicitly linked in the "Related pages" section; serves as the broader reference catalogue for the observability stack.
- **`docs/tools/observability-layer.md`** — the parent/overview page for the three-signal observability layer (metrics, logs, traces); this page is the trace-signal deep-dive within it.
- **`docs/tools/package-dependencies.md`** — lists the `@opentelemetry/*` npm packages documented in this page's instrumentation table.

## Notes

- **Import order is critical.** `startTracing()` must execute before Express, Mongoose, and Redis are imported; auto-instrumentation hooks fail silently otherwise.
- **Unset endpoint = no export, no error.** If `OTEL_EXPORTER_OTLP_ENDPOINT` is absent the SDK runs but simply drops spans. There is no fallback exporter.
- **Collector as decoupling point.** Adding a new backend (Jaeger, cloud OTLP) is a collector-config change only; app code is untouched.
- **Cache benefit is visually obvious in traces.** A Redis `GET` span with no following Mongoose span signals a cache hit—no extra annotation needed.
