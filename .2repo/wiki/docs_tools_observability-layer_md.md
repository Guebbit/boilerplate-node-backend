# docs/tools/observability-layer.md

## Purpose

Documents the **in-repo code** of the observability layer: which files carry each of the five signals (logs, metrics, traces, audit, analytics), how modules augment shared infrastructure, and the invariants any change must preserve. Complements the external-stack reference (Prometheus, Loki, Tempo, Grafana) by focusing on the application-side seams.

## Key elements

- **`adapters/logger.ts`** — Winston JSON logger (two loggers); every tier logs, output goes to stdout → Promtail → Loki.
- **`observability/metrics-http.ts`** — shared `metricsRegistry`, HTTP counters, one latency histogram. Scraped at `GET /observability/metrics`.
- **`observability/tracer.ts`** — thin OTel wrapper (`withSpan`, `getActiveSpanContext`). Spans flow OTLP → collector → Tempo.
- **`observability/audit.ts`** — action vocabulary, `emitAuditEvent`, sink port. Log line always; Mongo row when `audit-logs` installs the sink.
- **`observability/analytics/`** — provider port with `umami` (default), `posthog`, `none`.
- **`observability/dependency-health.ts`** — backing-service states read without I/O. Backs `GET /observability/health`.
- **`observability/stream.ts`** — SSE endpoint, 5 s updates, 15 s heartbeat. Backs `GET /observability/events`.
- **`src/modules/observability/`** — controllers only (no service, no model) exposing `/observability/{health,metrics,metrics/overview,audit,events}`.
- **`<module>/metrics.ts`, `<module>/audit.ts`, `<module>/analytics.ts`** — per-module declaration merging that augments the shared registries/maps.

## Relationships

- **`docs/tools/observability-reference.md`** — the external stack and its config; this page is the in-repo counterpart.
- **`docs/api/observability.md`** — documents what each `/observability/*` route returns (the HTTP contract this layer serves).
- **`docs/modules/observability.md`** — the module-level view (routes, controllers) that this page places in the broader signal pipeline.
- **`docs/reference/src-infrastructure.md`** — catalogs the `adapters/` and `observability/` files referenced here.
- **`docs/tools/events-and-logging.md`** — the log pipeline (Winston → stdout → Promtail → Loki) that the logger entry feeds.
- **`docs/tools/analytics.md`** — event names and which side emits them; this page covers the provider port and selection.
- **`docs/reference/tests.md`** — `tests/integration/observability-auth.test.ts` covers the `NODE_METRICS_TOKEN` gate that supertest cannot exercise on `GET /observability/metrics`.

## Notes

- **Name-based dashboard reads.** `get-observability-metrics-overview.ts` calls `metricsRegistry.getSingleMetric('auth_login_total')` by string name and reports zero when absent. The observability module deliberately imports no other domain module.
- **Audit fails open, in two layers.** The log line is the compliance record (emitted first). The Mongo row is fire-and-forget; its own failures are counted via `audit_sink_failures_total` so an empty `GET /observability/audit` response is distinguishable from a silent sink failure.
- **Liveness ≠ readiness.** `GET /` (container HEALTHCHECK) answers "is the process alive." `GET /observability/health` answers "can this instance serve" and performs **zero I/O** — it reads connection state the adapters already maintain. Conflating them risks an orchestrator restart loop on a transient dependency blip.
- **No log→trace correlation beyond `trace_id`.** No in-repo RED/USE dashboards (they live in Grafana provisioning). No per-domain histograms, no sampling, no reachability probes in the health endpoint.
- **Two routes are not request-side contract-tested for transport reasons:** SSE (`/events`) never completes under supertest; `/metrics` requires `NODE_METRICS_TOKEN` in the environment (covered by a dedicated auth test instead).
