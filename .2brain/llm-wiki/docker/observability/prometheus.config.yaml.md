---
source: docker/observability/prometheus.config.yaml
sha256: eb72f1929315358ccb1c263eccc2522571744d3efa4f52265e236eb33be9d64d
generated_at: 2026-09-27T13:47:52.178865+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.config.yaml

## Purpose

Prometheus server configuration that defines scrape targets, alert-rule loading, and alert routing. It exists because Prometheus requires an explicit list of metrics endpoints to pull from and a destination for firing alerts before it can do any useful work in the local observability stack.

## Key elements

- **`global`** — Sets `scrape_interval` and `evaluation_interval` to 15 s each.
- **`rule_files`** — Globs `/etc/prometheus/rules/*.yml`, the mount point for alert/recording rules.
- **`alerting.alertmanagers`** — Static target `alertmanager:9093` for forwarded alert results.
- **`scrape_configs`** — Three jobs:
  - `api` — Pulls `app:3000/observability/metrics`. Authenticates with a Bearer token read from `/etc/prometheus/secrets/metrics-token` (a file, not an inline string). Relabels `__address__` to a stable `instance: api` label.
  - `otel-collector` — Pulls `otel-collector:8888/metrics` for collector self-observability (queue depth, exporter health, etc.).
  - `otel-collector-spanmetrics` — Pulls `otel-collector:8889/metrics` for trace-derived `traces_service_graph_request_*` series produced by the collector's servicegraph connector.

## Relationships

- **`prometheus.alert-rules.yaml`** — Mounted into the container and loaded via the `rule_files` glob. Prometheus evaluates the rules here on every `evaluation_interval` and routes any firing alert to Alertmanager.
- **`alertmanager.config.yaml`** — The `alerting` block in this file points at `alertmanager:9093`; Alertmanager's own config (routers, receivers, silences) lives in its dedicated file.
- **`otel-collector.config.yaml`** — Defines the two internal ports Prometheus scrapes: 8888 (self-metrics) and 8889 (spanmetrics / servicegraph). If either listener is removed from the collector config, the corresponding scrape job goes DOWN.
- **`grafana.datasources.yaml`** — The `otel-collector-spanmetrics` job feeds the series that Grafana's Tempo datasource `serviceMap` panel queries for the Service Graph view.

## Notes

- **Port is a literal.** `app:3000` is hardcoded because Prometheus performs no variable substitution and has no access to `.env`. Changing `NODE_PORT` without updating this target produces a scrape DOWN that looks like the API is down rather than a stale config.
- **Token rotation is file-based.** `credentials_file` is re-read on every scrape, so rotating the API's `NODE_METRICS_TOKEN` (written by `npm run setup` into the mounted file) requires no Prometheus restart.
- **The `/observability/metrics` endpoint is intentionally non-public.** It exposes request volumes, error rates, latency percentiles, and login success/failure counters — a behavioral fingerprint of the service. The Bearer token is the sole gate.
