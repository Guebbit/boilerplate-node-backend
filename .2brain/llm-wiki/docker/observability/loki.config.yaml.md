---
source: docker/observability/loki.config.yaml
sha256: 724a8161e6ed5641c790ea484cafc7aa5eff4be2a7ddd08e3aea413e433d81dc
generated_at: 2026-09-23T17:13:19.762192+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/loki.config.yaml

## Purpose

Local single-node Loki configuration for the development observability stack. It configures Loki to use filesystem-backed storage with no external dependencies, providing log ingestion (via Promtail), querying (via Grafana), and optional alert-rule evaluation with a one-week retention window.

## Key elements

- **`server`** – Exposes HTTP on port **3100** (consumed by Grafana and Promtail) and gRPC on port **9096**.
- **`common`** – Single-instance setup: `replication_factor: 1`, `inmemory` ring store, all chunks and rules under `/var/loki/`.
- **`query_range.results_cache`** – Enables a 100 MB in-process embedded cache for repeated queries.
- **`schema_config`** – Uses the `tsdb` index store with a `filesystem` object store; schema v13, 24-hour index period.
- **`ruler`** – Points to `http://alertmanager:9093` so that any defined Loki alert rules are forwarded to Alertmanager.
- **`limits_config.retention_period`** – Caps stored logs at **168 h** (one week).
- **`compactor`** – Enables retention-driven deletion with a filesystem-backed delete-request store in `/var/loki/compactor`.
- **`auth_enabled: false`** – No authentication; intended for local-only use.

## Relationships

- **`docker/observability/promtail.config.yaml`** / **`promtail.podman.config.yaml`** – Promtail ships log streams to this Loki instance over HTTP port 3100.
- **`docker/observability/grafana.datasources.yaml`** – Registers this Loki endpoint (port 3100) as a LogQL datasource for Grafana panels.
- **`docker/observability/alertmanager.config.yaml`** – Receives alert-rule evaluations forwarded by Loki's `ruler` at `http://alertmanager:9093`.

## Notes

- The ring uses an `inmemory` KV store; ring state is not persisted across restarts. This is safe here because `replication_factor` is 1 and the instance is the sole node.
- `ruler.alertmanager_url` is inert unless Loki alert rules are actually defined (e.g., via a `rules/` mount); it does not change behaviour in the default stack.
- Retention is enforced by the compactor, not by the schema; ensure the container's writable volume has enough space for ~7 days of log chunks.
