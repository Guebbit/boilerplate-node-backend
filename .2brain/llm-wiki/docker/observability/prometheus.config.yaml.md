---
source: docker/observability/prometheus.config.yaml
sha256: 479d95a5ac8365e0807c2de09a303a9151a2b7d19e68b10dcdffeb7ac3d26c67
generated_at: 2026-10-14T06:51:28.819131+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.config.yaml

## Purpose

Prometheus's main runtime configuration. It declares which targets to scrape, how often to evaluate rules, where to send firing alerts, and which rule files to load. Without it Prometheus starts with no targets, no alert routing, and no rule evaluation.

## Key elements

- **global** – Sets `scrape_interval` and `evaluation_interval` to 15 s.
- **rule_files** – Loads all `*.yml` under `/etc/prometheus/rules/` (the mounted alert/recording rules).
- **alerting.alertmanagers** – Static target `alertmanager:9093`; every firing alert is pushed here.
- **scrape_configs / job `api`** – Pulls `/observability/metrics` from `app:3000`. Authenticates with a Bearer token read from `/etc/prometheus/secrets/metrics-token` (a file, not an env var). Relabels the target to a stable `instance=api` label.
- **scrape_configs / job `otel-collector`** – Pulls `/metrics` from `otel-collector:8888` (collector self-observability: queue depth, exporter health, etc.).
- **scrape_configs / job `otel-collector-spanmetrics`** – Pulls `/metrics` from `otel-collector:8889` (the `traces_service_graph_request_*` family derived by the collector's servicegraph connector).
- **scrape_configs / job `prometheus`** – Self-scrape on `localhost:9090`.
- **scrape_configs / job `alertmanager`** – Scrapes `alertmanager:9093` so its own health/alerting metrics are queryable.

## Relationships

- **`prometheus.alert-rules.yaml`** – Consumed via the `rule_files` glob; its alert and recording rules are evaluated on the 15 s cycle defined here.
- **`alertmanager.config.yaml`** – Receiving endpoint for all firing alerts (`alertmanager:9093`); also scraped as a `scrape_configs` target.
- **`otel-collector.config.yaml`** – Source of the two collector scrape targets (ports 8888 and 8889).
- **`grafana.datasources.yaml`** – Downstream consumer: Grafana dashboards query the metrics produced by these scrape jobs; the `otel-collector-spanmetrics` job specifically feeds the Tempo Service Graph view.

## Notes

- **Token via file, not env.** Prometheus has no `.env` access and no variable substitution, so the Bearer token is read from `credentials_file`. The file is re-read on every scrape, so rotating `NODE_METRICS_TOKEN` requires no Prometheus restart.
- **Hardcoded port.** `app:3000` is a literal; it must be kept in sync with `NODE_PORT`. There is no interpolation — changing `NODE_PORT` alone causes a silent `DOWN` state that looks like an application outage.
- **Two collector ports, two jobs.** 8888 reports collector health; 8889 reports derived trace metrics. They are intentionally separate jobs so a failure on one doesn't mask the other in dashboards.
- **`/observability/metrics` is not public.** It exposes operational detail (error rates, login counters, latency percentiles). The Bearer token is the sole gate; there is no OAuth/JWT flow because Prometheus cannot maintain a session.
