---
source: docker/observability/prometheus.config.yaml
source_sha256: 6f222935b6262aad6c029bcaa0c47e870fc9de7839c9a35e2760d0036c5dc864
context_sha256: 6562de592ba365487ceb96f73d6518a30c33ac81458c786d098335ab06236023
generated_at: 2026-11-22T01:33:19.270770+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/prometheus.config.yaml

## Purpose
Local/dev Prometheus configuration. It defines the scrape targets (the API, queue workers, the OpenTelemetry collector, and Prometheus and Alertmanager themselves), loads alert rule files, and points Prometheus at Alertmanager for firing alerts.

## Key elements
- **`global`**: `scrape_interval` and `evaluation_interval` are both 15s.
- **`rule_files`**: loads `/etc/prometheus/rules/*.yml`.
- **`alerting`**: sends alerts to `alertmanager:9093`.
- **Job `api`**: scrapes `app:3000` at `/observability/metrics` with a Bearer token read from `credentials_file: /etc/prometheus/secrets/metrics-token`. A relabel rule sets `instance="api"`.
- **Job `worker`**: scrapes `worker:3010` (`instance: worker`) and `worker-heavy:3010` (`instance: worker-heavy`) at the same path, with the same token. Two alert counters, `queue_jobs_dead_lettered_total` and `webhook_delivery_attempts_total`, are emitted only by the worker. The `QueueJobsParked` and `WebhookDeliveriesFailingEverywhere` alerts depend on this job.
- **Job `otel-collector`**: scrapes the collector's self-metrics at `otel-collector:8888/metrics`.
- **Job `otel-collector-spanmetrics`**: scrapes `otel-collector:8889/metrics`, the metrics derived from traces (`traces_service_graph_request_*`).
- **Jobs `prometheus` and `alertmanager`**: self-scrapes of `localhost:9090` and `alertmanager:9093`.

## Relationships
- **`compose.override.yaml`**: mounts the metrics-token secret file read-only into the Prometheus container. `npm run setup` writes that file with the API's `NODE_METRICS_TOKEN`.
- **`prometheus.alert-rules.yaml` / `prometheus.infra-rules.yaml`**: the rule files that `rule_files` loads. The infra rules read the `prometheus` and `alertmanager` jobs' metrics (failed notifications, rule evaluation errors). The alert rules rely on the `worker` job for `QueueJobsParked` and `WebhookDeliveriesFailingEverywhere`.
- **`alertmanager.config.template.yaml`**: configures the Alertmanager instance at `alertmanager:9093` that this file targets.
- **`otel-collector.config.yaml`**: the collector exposes the 8888 and 8889 endpoints scraped here. 8889 carries the servicegraph connector output.
- **`grafana.datasources.yaml`**: the Tempo datasource's `serviceMap` reads the `traces_service_graph_request_*` metrics from the `otel-collector-spanmetrics` job.
- **`prometheus.production.config.yaml`**: the production counterpart. This file's header describes it as the local setup.

## Notes
- Prometheus does no variable substitution and cannot read `.env`, so the ports are literals. `app:3000` must match `NODE_PORT`, and `worker:3010` and `worker-heavy:3010` must match `NODE_WORKER_PORT`. A stale port makes the target go DOWN with a connection error, which looks like the API being down.
- `/observability/metrics` is no longer public, so the `api` and `worker` jobs authenticate with a static bearer token. Prometheus re-reads the token file on every scrape, so rotating the token needs no Prometheus restart.
- The rule files glob uses the `.yml` extension, while the neighbor rule files are named `*.yaml`. Check how they are mounted into `/etc/prometheus/rules/` before assuming they are loaded.
