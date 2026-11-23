---
source: docker/observability/prometheus.production.config.yaml
source_sha256: a2b9bc4a90a6eaa30a8351497188f4871cc07059c1122e9fa96c20106079bfb8
context_sha256: c0920e6b911d63d08a4e061a79f2be401587180109285798c853b9d49c24e9d0
generated_at: 2026-11-22T01:33:59.447194+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/prometheus.production.config.yaml

## Purpose
Prometheus configuration for the production `monitoring` profile. It scrapes the API, the queue workers, host disk metrics, and Prometheus and Alertmanager themselves, and it evaluates alert rules and routes alerts to Alertmanager. It exists separately from `prometheus.config.yaml` because that file also scrapes the OTel collector, which the production stack does not run, so those targets would show as DOWN.

## Key elements
- **global**: `scrape_interval` and `evaluation_interval`, both 15s.
- **rule_files**: loads `/etc/prometheus/rules/*.yml`. The rules are the same ones the local stack loads (`prometheus.alert-rules.yaml`).
- **alerting**: a single static Alertmanager target, `alertmanager:9093`.
- **Job `api`**: scrapes `app:3000` at `/observability/metrics` with a Bearer token. The `instance` label is rewritten to `api` through a relabel config.
- **Job `worker`**: scrapes `worker:3010` (instance `worker`) and `worker-heavy:3010` (instance `worker-heavy`) at the same path and with the same token. It is needed because the `queue_jobs_dead_lettered_total` and `webhook_delivery_attempts_total` counters move only in the worker. Without this job, `QueueJobsParked` and `WebhookDeliveriesFailingEverywhere` would never fire.
- **Job `node`**: scrapes `node-exporter:9100` for host disk metrics (filesystem only).
- **Jobs `prometheus` and `alertmanager`**: self-monitoring targets (`localhost:9090` and `alertmanager:9093`). The `alerting.rules` in `prometheus.infra-rules.yaml` read these.

## Relationships
- **compose.production.yaml**: mounts the rules file into the Prometheus container (as noted in the file's comments). It provides the `metrics_token` secret at `/run/secrets/metrics_token`, the `app` service name, and the node_exporter service.
- **prometheus.config.yaml**: the local-stack counterpart. This file mirrors its API scrape and rule files but leaves out the OTel collector.
- **alertmanager.config.template.yaml**: configures the Alertmanager that this file targets at `alertmanager:9093` and scrapes as a job.

## Notes
- Prometheus does no variable substitution, so the ports are literals. `app:3000` must match `NODE_PORT`, and the worker port `3010` corresponds to `NODE_WORKER_PORT`.
- The scrape credential is the same `metrics_token` secret file that the app reads its `NODE_METRICS_TOKEN` from. Prometheus re-reads the file on every scrape, so rotating the token needs no Prometheus restart.
- The `node` job does not set `metrics_path` or `authorization`, so it uses Prometheus defaults. The same applies to the `prometheus` and `alertmanager` jobs.
