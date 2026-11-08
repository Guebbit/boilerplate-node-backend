---
source: docker/observability/prometheus.production.config.yaml
sha256: c3e55d9f3cc9451198b9fb6479307eccdbc4546a9f25724707640032cd65279b
generated_at: 2026-11-08T02:23:39.164158+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.production.config.yaml

## Purpose

Production Prometheus configuration for the `monitoring` profile. It exists as a separate file from the local `prometheus.config.yaml` because the production stack does not run an OTel collector; including those scrape targets (as the local file does) would cause them to report DOWN. It wires up the app's metrics endpoint, Alertmanager, self-monitoring, and node_exporter.

## Key elements

- **`global`** — Sets `scrape_interval` and `evaluation_interval` to 15 s.
- **`rule_files`** — Loads alert rules from `/etc/prometheus/rules/*.yml` (mounted by `docker-compose.production.yml` from the shared `prometheus.alert-rules.yaml`).
- **`alerting`** — Registers `alertmanager:9093` as the notification receiver.
- **`scrape_config_files`** — Dynamically loads any `.yml` file under `/etc/prometheus/scrape.d/` (e.g. the Traefik scrape config from `docker-compose.proxy.yml`). No file present means no extra job.
- **`scrape_configs: api`** — Scrapes the app at `app:3000` on path `/observability/metrics` using a Bearer token from the `metrics_token` compose secret (`/run/secrets/metrics_token`). Relabels `instance` to the literal string `api` for stable dashboards/alerts.
- **`scrape_configs: node`** — Scrapes `node-exporter:9100` for filesystem metrics.
- **`scrape_configs: prometheus` / `alertmanager`** — Self-monitoring targets (`localhost:9090`, `alertmanager:9093`) consumed by the `alerting.rules` in the infra rules file.

## Relationships

- **`prometheus.infra-rules.yaml`** — Contains the `alerting.rules` group whose expressions depend on metrics produced by the `prometheus` and `alertmanager` scrape jobs defined here (rule evaluation errors, failed notifications). The rule file is loaded at runtime via the `rule_files` glob.
- **`prometheus.traefik-scrape.yaml`** — Placed under `/etc/prometheus/scrape.d/` by the compose proxy overlay; picked up by this file's `scrape_config_files` directive. It adds the Traefik proxy scrape job without modifying this config.

## Notes

- The `app:3000` target is a **literal** address; Prometheus performs no variable substitution. It must stay in sync with `NODE_PORT` and the service name in `docker-compose.production.yml`.
- The Bearer token file is re-read on every scrape, so rotating `metrics_token` requires no Prometheus restart.
- Because `scrape_config_files` is a glob, a missing directory simply yields zero jobs—no error. This is intentional so the config works even when the proxy overlay is absent.
