---
source: docker/observability/loki.config.yaml
sha256: 724a8161e6ed5641c790ea484cafc7aa5eff4be2a7ddd08e3aea413e433d81dc
generated_at: 2026-11-08T02:22:13.834622+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/loki.config.yaml

## Purpose

Single-node Loki configuration for the local observability stack. It wires up Loki in a minimal, filesystem-backed mode so developers can query logs with Grafana without requiring object storage, a ring backend, or authentication.

## Key elements

- **`auth_enabled: false`** — disables all auth; intended exclusively for local/dev use.
- **`server.http_listen_port: 3100` / `grpc_listen_port: 9096`** — the two ports Grafana (HTTP) and Promtail (gRPC) connect to.
- **`common.storage.filesystem`** — chunks and rules are written under `/var/loki`; no S3 or other object store is used.
- **`common.ring.kvstore.store: inmemory`** — single-instance ring; no Consul/etcd needed.
- **`query_range.results_cache`** — 100 MB in-process cache to speed up repeated LogQL queries during development.
- **`schema_config`** — single schema block (v13, TSDB index, 24 h index periods, filesystem object store) effective from 2020-10-24.
- **`ruler.alertmanager_url`** — points to `http://alertmanager:9093` so that any Loki alerting rules fire into Alertmanager.
- **`limits_config.retention_period: 168h`** — caps log retention at one week.
- **`compactor`** — runs in `/var/loki/compactor` with retention deletion enabled, pruning expired blocks on the filesystem.

## Relationships

- **`docker/observability/alertmanager.config.template.yaml`** — Loki's `ruler` section is configured to forward alerts to the Alertmanager instance that this template defines (expected at `alertmanager:9093`). Alert rules defined in Loki therefore depend on that service being reachable.
- **`docker/observability/grafana.datasources.yaml`** — registers Loki as a Grafana datasource; Grafana sends LogQL queries to the HTTP port (3100) defined here.

## Notes

- All storage paths assume a writable `/var/loki` volume; the container must mount a volume there or logs are lost on restart.
- `replication_factor: 1` and the in-memory ring mean there is **no** fault tolerance or horizontal scaling — this config is not suitable for multi-node deployments.
- The `ruler` block is present but inert unless a separate Loki rules file is mounted or supplied; without rules it is a no-op.
- Retention is enforced only by the compactor. Until the compactor cycle runs, expired chunks remain on disk, so the effective on-disk size can briefly exceed 168 h worth.
