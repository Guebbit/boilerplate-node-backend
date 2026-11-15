---
type: concept
audience: [developer, architect]
---

# Tools explained: observability

The observability tools, one by one.

## Observability stack

Observability is the ability to understand what a running system is doing from its outputs. Three complementary signals cover the full picture:

| Signal      | Question it answers                                         | Tool in this repo                         |
| ----------- | ----------------------------------------------------------- | ----------------------------------------- |
| **Traces**  | What did one specific request actually do, step by step?    | OpenTelemetry → OTel Collector → Tempo    |
| **Metrics** | How is the system behaving in aggregate over time?          | Prometheus → Grafana                      |
| **Logs**    | What text events happened, in what order, on which request? | Winston → stdout → Alloy → Loki → Grafana |

---

### Winston (logs)

**What it is.** Winston is the most widely used structured logging library for Node.js. It supports multiple transports (stdout, files, HTTP) and formats (JSON, pretty-print) and lets you define custom log levels.

**Problem it solves.** `console.log` strings are hard to parse, filter, or correlate across requests. Structured JSON logs (one object per line) can be ingested by a log aggregator (Loki, Elasticsearch, CloudWatch) and queried with filters like `level=error AND service=api`.

**In this repo.** Two loggers: `logger` for request/access logs and the audit logger (`src/infrastructure/observability/audit.ts`) for security events. Both write JSON to stdout. Every log line carries `trace_id` so a log entry can be linked back to its full trace in Grafana. Sensitive fields (`password`, `token`, `authorization`) are redacted before any log is written.

→ [Winston & Audit Logs](../operate/winston.md)

---

### Prometheus (metrics)

**What it is.** Prometheus is a time-series database and monitoring system. It works by scraping an HTTP endpoint exposed by the application — at regular intervals Prometheus pulls the current metric values and stores them as time-stamped data points.

**Problem it solves.** Logs and traces tell you about individual events. Metrics answer aggregate questions: "What is the current request rate?", "How many errors happened in the last 5 minutes?", "Is p95 latency creeping up?" Without metrics you are blind to trends until they become outages.

**In this repo.** Scrapes `/observability/metrics` every 15 seconds. Metrics include HTTP request rates, latency histograms (p50/p95/p99), error counts, in-flight requests, and business counters (logins, checkouts). Alert rules fire to Alertmanager when error rate or latency crosses configured thresholds. Stored for 7 days.

→ [Prometheus](../operate/prometheus.md)

---

### Alertmanager

**What it is.** Alertmanager is Prometheus's companion for alert routing. Prometheus evaluates rules and marks alerts as firing; Alertmanager groups, deduplicates, silences, and routes those alerts to configured receivers (Slack, PagerDuty, email, webhooks).

**Problem it solves.** If Prometheus fired an alert directly to every receiver every 15 seconds during an outage you would be spammed with hundreds of identical messages. Alertmanager batches related alerts, applies repeat intervals, and applies silence rules — so on-call teams get one actionable notification, not a flood.

**In this repo.** Local dev delivers alert mail to mailpit (a sink, so no real notification is sent); a route whose knob is set to empty goes to a `null` receiver. Alert rules (`prometheus.alert-rules.yaml`) cover availability, errors and latency, queue and outbox failures, stale scheduled jobs, and a `security.rules` group — the table is in [Prometheus](../operate/prometheus.md#alert-rules). Replace the receiver with Slack or PagerDuty for staging/production.

→ [Prometheus](../operate/prometheus.md) · [Observability Reference](../operate/observability-reference.md)

---

### OpenTelemetry (traces)

**What it is.** OpenTelemetry (OTel) is a vendor-neutral open standard for distributed tracing, metrics, and logs. It provides SDKs for every major language and a common wire format (OTLP). An "instrumentation" library wraps a framework (Express, Mongoose, Redis) and automatically creates "spans" for each operation.

**Problem it solves.** When a request fails it is often not obvious _which_ database query was slow, _which_ middleware threw, or _which_ downstream call timed out. Distributed tracing produces a timeline of every operation that happened inside a single request — from the HTTP entry point down to the individual MongoDB query — with durations and error attributes attached to each step.

**In this repo.** Auto-instrumentation for HTTP, Express, Mongoose, and Redis. No per-request code is needed — `startTracing()` is called once at boot before any instrumented libraries are imported. Traces are exported via OTLP/HTTP to the OTel Collector, which forwards them to Tempo.

→ [OpenTelemetry](../operate/opentelemetry.md)

---

### OTel Collector

**What it is.** The OpenTelemetry Collector is a standalone service that receives telemetry data from applications and routes it to one or more backends. It acts as a fan-out proxy: receive once, export to many.

**Problem it solves.** If the app exports traces directly to Tempo, switching to Jaeger or a cloud vendor requires changing app code and redeploying. The collector breaks that coupling — swap backends in the collector config without touching the app. The collector can also batch, filter, and sample spans before export.

**In this repo.** Listens on `:4318` (OTLP/HTTP) and `:4317` (OTLP/gRPC). Batches spans and exports to Tempo via internal gRPC. Config lives at `docker/observability/otel-collector.config.yaml`.

→ [OpenTelemetry](../operate/opentelemetry.md) · [Observability Reference](../operate/observability-reference.md)

---

### Tempo (trace storage)

**What it is.** Grafana Tempo is an open-source, horizontally scalable distributed trace storage system. It receives spans from the OTel Collector, stores them, and makes them queryable via TraceQL or by `trace_id` lookup.

**Problem it solves.** Traces can be large — a busy API produces millions of spans per day. A general-purpose database is not designed to ingest, store, and query trace data efficiently. Tempo is optimised specifically for that workload: ingest is cheap, storage is compact, and lookups by trace ID are fast.

**In this repo.** Runs in single-binary mode with local filesystem storage. Retention is 24 hours locally to keep disk usage small. All trace exploration happens through Grafana — you never query Tempo directly.

→ [Tempo](../operate/tempo.md)

---

### Loki (log storage)

**What it is.** Grafana Loki is a log aggregation system inspired by Prometheus. Instead of full-text indexing every word in every log line (like Elasticsearch does), Loki indexes only a small set of labels (`service`, `level`, `job`) and stores the raw log lines compressed. Queries filter by label first, then scan the matching compressed chunks.

**Problem it solves.** Full-text indexed log stores (Elasticsearch) are expensive to run and scale because every word in every log line is indexed. Most log queries start with a label filter anyway (`service=api, level=error`). Loki's label-only index makes it much cheaper to operate while remaining fast for the most common query patterns.

**In this repo.** Receives log lines from Alloy. Winston writes structured JSON to stdout; the container runtime captures it to a log file; Alloy tails that file and pushes to Loki. Labels parsed: `service`, `level`, `job`. Retention is 7 days. Queried via LogQL in Grafana.

→ [Loki](../operate/loki.md)

---

### Alloy (log shipping)

**What it is.** Alloy is Grafana's telemetry collector — an agent that tails log files on the host, applies pipeline transformations (parse JSON, add labels, drop noise), and pushes log entries to Loki. It replaces Promtail, which has been end of life since March 2026.

**Problem it solves.** Loki does not pull logs — something must push them. Alloy sits on the host, knows where each container writes its log file, and handles the Docker vs Podman format differences without changes to the app itself.

**In this repo.** One config, `docker/observability/alloy.logs.config.alloy`, reads both Docker (`json-file` log driver) and Podman (`k8s-file` / CRI format) at once, and the production stack loads the same file. `CONTAINER_LOGS_PATH` in `.env` says where the host keeps the logs (docker's is the default), and on Podman `CONTAINER_LOG_DRIVER=k8s-file` is what makes the log files exist at all — its own default, `journald`, writes none.

→ [Loki](../operate/loki.md) · [Docker & Podman](../build/docker-and-podman.md)

---

### Grafana (UI)

**What it is.** Grafana is an open-source observability UI. It connects to data sources (Prometheus, Tempo, Loki, and many others), renders dashboards and charts from queries, and lets you explore metrics, traces, and logs side by side.

**Problem it solves.** Prometheus, Tempo, and Loki each have their own query language and their own UI. Grafana unifies them: one browser tab to explore a p95 latency spike (Prometheus), jump to the slow trace (Tempo), and read the correlated log lines (Loki) — all linked because they share a `trace_id`.

**In this repo.** Auto-provisioned with Prometheus, Tempo, and Loki datasources. Ships a starter "API Traces" dashboard. Cross-signal jumps are configured so clicking a span opens the related Loki logs. Anonymous admin access in local dev — no login required. Available at `http://localhost:3001`.

→ [Grafana](../operate/grafana.md)

---

## Read next

- [tools-explained](./tools-explained.md): the hub this page belongs to.
