# docs/tools/observability-layer.md

## Purpose

Documents the **in-repo code** that makes up the observability layer: how five signals (logs, metrics, traces, audit, analytics) plus readiness and the SSE live stream are wired through shared infrastructure modules and per-module augmentation files. Pairs with the external-stack reference; this page is the code-side map.

## Key elements

- **`adapters/logger.ts`** — Winston-based JSON logger (two loggers). Emits to stdout → Promtail → Loki. Lifts `trace_id` into every line.
- **`observability/metrics-http.ts`** — Exports the shared `metricsRegistry`; defines the single HTTP counter and route-labelled latency histogram. Exposed at `GET /observability/metrics` (token-gated).
- **`observability/tracer.ts`** — Thin wrapper over the OpenTelemetry API (`withSpan`, `getActiveSpanContext`). Spans go OTLP → collector → Tempo.
- **`observability/audit.ts`** — Defines the audit action vocabulary, `emitAuditEvent`, and the sink port. Always writes a log line (compliance record); optionally writes a Mongo row via the sink. Emits `audit_sink_failures_total` on sink errors.
- **`observability/analytics/`** — Provider port with three backends: `umami` (default), `posthog`, `none`.
- **`observability/dependency-health.ts`** — Reports every backing service's state **without performing I/O** (reads adapter connection state). Served at `GET /observability/health`.
- **`observability/stream.ts`** — SSE endpoint (`GET /observability/events`), 5 s updates, 15 s heartbeat. Shape pinned by `asyncapi.yaml`.
- **`src/modules/observability/`** — Controllers only (no service, no model). Exposes `/observability/{health,metrics,metrics/overview,audit,events}`.
- **Per-module augmentation files** — `<module>/metrics.ts`, `<module>/audit.ts`, `<module>/analytics.ts` augment infrastructure maps via TypeScript declaration merging. Deleting a module removes its vocabulary automatically.

## Relationships

- **`docs/tools/observability-reference.md`** — Explicitly linked as the counterpart for the *external* stack (Prometheus, Loki, Tempo, Grafana, OTel collector) and its config. This page covers only in-repo code.
- **`docs/tools/opentelemetry.md`** — `observability/tracer.ts` is a thin wrapper over the OTel API; OTel provider setup, SDK configuration, and collector wiring are documented there.
- **`docs/tools/package-dependencies.md`** — The layer depends on packages (Winston, `@opentelemetry/*`, SSE utilities) whose versions and roles are tracked in the dependency manifest.

## Notes

- **Metrics are looked up by name string, not import.** `get-observability-metrics-overview.ts` calls `metricsRegistry.getSingleMetric('auth_login_total')` and reports zero if absent. This is why the overview controller has zero `dependsOn` on other modules.
- **Audit is deliberately fail-open.** The log line is the compliance record and is emitted first. The Mongo sink is fire-and-forget and swallows its own errors so a database hiccup cannot turn a rejected request into a 500.
- **Liveness ≠ readiness.** `GET /` (container HEALTHCHECK) answers "is the process alive." `GET /observability/health` answers "can this instance serve, and what is missing." Conflating them causes an orchestrator to restart a healthy container because a dependency blinked.
- **Readiness performs no I/O.** Every dependency status is read from the connection state the adapter already maintains, so a high-frequency poll cannot become an amplification attack on the infrastructure it reports on.
- **Two endpoints are not contract-tested from the request side.** SSE (`/events`) hangs supertest; metrics (`/metrics`) requires `NODE_METRICS_TOKEN` in the process environment (covered in `tests/integration/observability-auth.test.ts`, including the deny-by-default 503).
- **Deliberate omissions** (documented to prevent re-litigation): no log→trace correlation beyond `trace_id`, no RED/USE dashboards in-repo, no per-domain latency histograms, no sampling, no reachability probes in the health endpoint.
