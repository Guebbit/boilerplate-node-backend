---
source: docker/observability/prometheus.config.yaml
sha256: 479d95a5ac8365e0807c2de09a303a9151a2b7d19e68b10dcdffeb7ac3d26c67
generated_at: 2026-11-08T02:23:05.153020+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.config.yaml

## Purpose

Prometheus server configuration that defines what to scrape, how often to evaluate rules, and where to send alerts. It wires together the API, OTel Collector, and the Prometheus/Alertmanager pair into a single observability loop.

## Key elements

- **`global`** — Sets `scrape_interval` and `evaluation_interval` to 15 s.
- **`rule_files`** — Glob-loads all `*.yml` files under `/etc/prometheus/rules/` (mount point for alert and recording rules).
- **`alerting`** — Forwards firing alerts to `alertmanager:9093`.
- **`scrape_configs`** — Five jobs:
  - `api` — Scrapes `/observability/metrics` on `app:3000` using a Bearer token read from `/etc/prometheus/secrets/metrics-token` (`credentials_file`). Relabels the instance label to `api`.
  - `otel-collector` — Scrapes `/metrics` on `otel-collector:8888` (collector self-observability: queue depth, exporter health, etc.).
  - `otel-collector-spanmetrics` — Scrapes `/metrics` on `otel-collector:8889` (service-graph / span-metrics derived by the collector's servicegraph connector).
  - `prometheus` — Self-scrape on `localhost:9090`.
  - `alertmanager` — Scrapes `alertmanager:9093` for its own `alerting.rules` metrics.

## Relationships

- **`docker/observability/otel-collector.config.yaml`** — Defines the two metric endpoints (`:8888` health, `:8889` span-metrics) that this file scrapes in the `otel-collector` and `otel-collector-spanmetrics` jobs.
- **`docker/observability/prometheus.alert-rules.yaml`** — Mounted into `/etc/prometheus/rules/` and loaded at runtime via the `rule_files` glob; its alert/recording expressions are evaluated on the `evaluation_interval` cadence set here.
- **`docker/observability_prometheus.infra-rules.test.yaml`** — Test fixture that exercises the infrastructure rules (Prometheus/Alertmanager self-monitoring) whose metrics this file collects in the `prometheus` and `alertmanager` jobs.

## Notes

- **Port is a literal.** The API target `app:3000` is hard-coded; Prometheus performs no env-var substitution. Changing `NODE_PORT` without updating this file makes the target appear DOWN.
- **Token rotation is restart-free on the Prometheus side.** `credentials_file` is re-read on every scrape, so `npm run setup` can rewrite `/etc/prometheus/secrets/metrics-token` without restarting the container.
- **8888 vs 8889 are semantically different jobs.** 8888 answers "is the collector healthy"; 8889 answers "what service-graph metrics did it derive." Grafana's Tempo `serviceMap` data source reads the latter.
- **`/observability/metrics` is intentionally non-public.** It exposes operational detail (error rates, login counters, latency percentiles). The Bearer token is the sole gate; there is no JWT flow.
