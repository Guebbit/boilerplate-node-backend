---
source: docker/observability/prometheus.config.yaml
sha256: 42a4e2d35d9ff33f238e7adb09f279a7249e72c03fe897b4e60981aed0a12d88
generated_at: 2026-09-23T17:13:53.019112+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.config.yaml

## Purpose

Prometheus server configuration for the local observability stack. It defines how often metrics are pulled, where alert rules are loaded from, which targets to scrape, and where evaluated alerts are forwarded.

## Key elements

- **`global`** — Sets `scrape_interval` and `evaluation_interval` to 15 s each.
- **`rule_files`** — Loads all `*.yml` files mounted at `/etc/prometheus/rules/`.
- **`alerting.alertmanagers`** — Routes firing alerts to `alertmanager:9093`.
- **`scrape_configs`** (three jobs):
    - **`api`** — Scrapes `app:3000/observability/metrics` with a static Bearer token; relabels `__address__` → `instance: api` for stable dashboard/alert labels.
    - **`otel-collector`** — Scrapes `otel-collector:8888/metrics` (collector self-observability: queue depth, exporter health, etc.).
    - **`otel-collector-spanmetrics`** — Scrapes `otel-collector:8889/metrics` (servicegraph-derived `traces_service_graph_request_*` metrics produced by the collector's servicegraph connector).

## Relationships

- **`prometheus.alert-rules.yaml`** — Mounted into the container at `/etc/prometheus/rules/`; Prometheus evaluates it on every `evaluation_interval` tick and forwards results to Alertmanager.
- **`alertmanager.config.yaml`** — Receives alerts at `alertmanager:9093` (the `alerting` block targets this service).
- **`otel-collector.config.yaml`** — Defines the 8888 and 8889 metric endpoints that the `otel-collector` and `otel-collector-spanmetrics` scrape jobs pull from.
- **`grafana.datasources.yaml`** — Consumes the `otel-collector-spanmetrics` job output for its Tempo Service Graph panel (`serviceMap` section).

## Notes

- **Hard-coded port.** Prometheus performs no variable substitution; the `3000` in the `api` target must be kept in sync with `NODE_PORT` in the API `.env`. A mismatch surfaces as a `DOWN` target (connection refused), which is indistinguishable from an actual API outage.
- **Bearer token is a dev default.** `change-me-dev-metrics-token` must equal `NODE_METRICS_TOKEN` in the API environment. Rotate it alongside `NODE_TOKEN_ACCESS` / `NODE_TOKEN_REFRESH` before exposing the stack beyond localhost.
- **Endpoint is intentionally non-public.** `/observability/metrics` leaks request volumes, error rates, latency percentiles, and auth success/failure counts — effectively a service-health fingerprint. The Bearer token is the sole gate; there is no public fallback.
- **8888 vs 8889 are different concerns.** 8888 reports collector health; 8889 reports _derived_ span metrics. Treating them as one job loses the ability to alert on collector liveness independently of span-metric availability.
