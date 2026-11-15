---
source: docker/observability/loki.config.yaml
sha256: e6295d26e9f8381a67f7fbd8f876a1dccb6fe24f2849c8a398e28e5315bd7841
generated_at: 2026-11-14T17:11:58.268705+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/loki.config.yaml

## Purpose

Loki configuration for a single-node, local Docker observability stack. It sets up filesystem-backed log storage, a one-week retention window, and an in-memory ring so Loki runs as a single process suitable for quick debugging without a distributed backend.

## Key elements

- **`server`** — Exposes the HTTP API on port 3100 (consumed by Grafana and Alloy) and a gRPC internal API on port 9096.
- **`common`** — Pins the instance to `127.0.0.1`, uses `/var/loki` as the data root, stores chunks and rules on the local filesystem, and uses an `inmemory` kvstore for the ring (no external coordinator).
- **`query_range`** — Enables a 100 MB embedded in-process results cache to speed up repeated dev queries.
- **`schema_config`** — Declares a single schema block (from 2020-10-24) using the TSDB index store, `v13` schema, and 24-hour index periods.
- **`ruler`** — Sets `alertmanager_url` to `http://alertmanager:9093` as the forwarding target for any log-based alert rules.
- **`limits_config`** — Caps log retention at 168 hours (one week).
- **`compactor`** — Runs with `retention_enabled: true` and a filesystem-backed `delete_request_store` to actually drop expired chunks.

## Relationships

- **`docker/observability/alertmanager.config.template.yaml`** — This file's `ruler.alertmanager_url` references the `alertmanager` service on port 9093; that service is configured by the alertmanager config template.
- **`docker/observability/grafana.datasources.yaml`** — Grafana reads logs from Loki's HTTP API (port 3100); the datasources file declares that endpoint so dashboards and the Explore page can query Loki.

## Notes

- `replication_factor: 1` and the `inmemory` ring store mean this is strictly a single-process setup; do not copy these values into a multi-node configuration.
- The `alertmanager_url` uses the Docker-internal hostname `alertmanager`, not `localhost` — it will only resolve inside the compose network.
- The schema `from` date (`2020-10-24`) is Loki's canonical default; it does not reflect the actual deploy date.
- Auth is explicitly disabled (`auth_enabled: false`), appropriate for a local dev stack but must not be carried into any exposed deployment.
