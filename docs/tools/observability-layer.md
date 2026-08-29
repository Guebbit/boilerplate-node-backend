# The Observability Layer

[Observability Stack Reference](./observability-reference.md) maps the **external stack** —
Prometheus, Loki, Tempo, Grafana, the OTel collector — and its config. This page is about the
**code in this repo**: what the layer is made of, and which seams hold it together.

## The layer, in one table

Five signals, one transport, one module.

| Signal          | Mechanism (infrastructure)                                                                        | What a module contributes                                                       | Where it goes                                                   |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Logs**        | `adapters/logger.ts` — Winston, JSON, two loggers                                                 | nothing; every tier just logs                                                   | stdout → Promtail → Loki                                        |
| **Metrics**     | `observability/metrics-http.ts` — the shared `metricsRegistry`, HTTP counters, latency histogram  | `<module>/metrics.ts` declares counters **onto the shared registry**            | `GET /observability/metrics`, scraped by Prometheus             |
| **Traces**      | `observability/tracer.ts` — a thin wrapper over the OTel API (`withSpan`, `getActiveSpanContext`) | nothing declared; spans are taken where useful                                  | OTLP → collector → Tempo                                        |
| **Audit**       | `observability/audit.ts` — the action vocabulary, `emitAuditEvent`, and the sink port             | `<module>/audit.ts` augments the action map; `audit-logs` **installs the sink** | a log line always; a Mongo row when the sink is registered      |
| **Analytics**   | `observability/analytics/` — the provider port + `umami` (default), `posthog`, `none`             | `<module>/analytics.ts` declares the names that module emits                    | the configured provider                                         |
| **Readiness**   | `observability/dependency-health.ts` — every backing service's state, read without I/O            | nothing                                                                         | `GET /observability/health`                                     |
| **Live stream** | `observability/stream.ts` — SSE, 5 s updates, 15 s heartbeat                                      | nothing                                                                         | `GET /observability/events`, shape pinned by `asyncapi.yaml`    |
| **The module**  | `src/modules/observability/` — controllers only, no service, no model                             | —                                                                               | `/observability/{health,metrics,metrics/overview,audit,events}` |

## The four properties any change has to preserve

1. **Modules own their vocabulary; infrastructure owns the mechanism.** `audit.ts`, `metrics.ts`
   and `analytics.ts` in a module _augment_ infrastructure's maps by declaration merging. No central
   file enumerates domains, so deleting a module takes its counters and actions with it.

2. **The dashboard reads counters by NAME, never by import.**
   `get-observability-metrics-overview.ts` calls `metricsRegistry.getSingleMetric('auth_login_total')`
   and reports zero when the metric is absent. That is the single most important line in the module:
   it is why the one component whose job is to report on every domain imports **none** of them.

3. **Audit fails open, deliberately, in two layers.** The log line is the compliance record and goes
   out first; the queryable Mongo row is a convenience the sink adds, fire-and-forget, swallowing its
   own errors. A Mongo hiccup cannot turn a rejected login into a 500. What the swallow cannot say on
   its own is counted — `audit_sink_failures_total` — because
   `GET /observability/audit` answering `{ items: [] }` otherwise looks exactly like "nothing
   happened".

4. **Liveness and readiness are different endpoints, on purpose.** `GET /` answers "is the process
   alive" and is what the container HEALTHCHECK probes; `GET /observability/health` answers "can this
   instance serve, and what is missing". Conflating them means an orchestrator restarting a healthy
   container because Redis blinked — and restarting it does not bring Redis back. Nothing in the
   readiness payload performs I/O: every dependency is read from the connection state its adapter
   already maintains, so the endpoint polled every few seconds by every replica cannot become an
   amplifier pointed at the infrastructure it reports on.

## What this layer does NOT have, and probably should not

Recorded so the question stops coming back:

- **No log→trace correlation beyond `trace_id`.** The logger lifts `trace_id` into every line, which
  is what Grafana needs to jump from a log to a span. Nothing more elaborate is warranted.
- **No RED/USE dashboards in-repo.** They live in the Grafana provisioning, not in application code.
- **No per-domain latency histograms.** One HTTP histogram labelled by normalized route covers it; a
  histogram per module would multiply cardinality for a question the route label already answers.
- **No sampling.** Traffic in a boilerplate does not need it, and adding it changes what every
  percentile means.
- **No reachability probes in the health endpoint.** See property 4 above — the connection state is
  what the adapters act on anyway, so reporting it is the truth the application runs on rather than a
  second opinion obtained by opening a socket.

## Two routes that are not contract-tested from the request side

Both for transport reasons rather than contract ones:

- `GET /observability/events` — SSE never completes, so supertest hangs on it. Its payload is
  `asyncapi.yaml`'s to pin anyway.
- `GET /observability/metrics` — the 200 needs `NODE_METRICS_TOKEN` in the process environment.
  `tests/integration/observability-auth.test.ts` covers it there instead, including the deny-by-default
  503 that fires when the token is unset.

## Related pages

- [Observability Stack Reference](./observability-reference.md) — the external stack and its config
- [Observability Endpoints](../api/observability.md) — what each route returns
- [Events & Logging](./events-and-logging.md) — the log pipeline
- [Product Analytics](./analytics.md) — event names, and which side emits them
