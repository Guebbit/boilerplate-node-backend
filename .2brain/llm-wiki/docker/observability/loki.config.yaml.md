---
source: docker/observability/loki.config.yaml
source_sha256: e6295d26e9f8381a67f7fbd8f876a1dccb6fe24f2849c8a398e28e5315bd7841
context_sha256: 4eea18f81cf0e8f78f83ab0ed117ca56e0d4a092ae8c822583a9acfb03f5164c
generated_at: 2026-11-22T01:32:22.938693+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/loki.config.yaml

## Purpose
Configures a single-process, local-development Loki instance. Loki needs explicit schema and storage setup even in local mode, so this file defines filesystem storage, a TSDB schema, a small query cache, and one-week log retention for quick debugging.

## Key elements
- `auth_enabled: false`: no multi-tenant auth.
- `server`: HTTP API on port `3100` (used by Grafana and Alloy) and gRPC on `9096`.
- `common`: single-node setup. Instance address is `127.0.0.1`, path prefix is `/var/loki`, and chunks and rules are stored on the filesystem under `/var/loki`. Replication factor is 1, and the ring uses an `inmemory` kvstore, so no distributed backend is needed.
- `query_range.results_cache`: embedded in-process cache, enabled, max 100 MB.
- `schema_config`: one entry from `2020-10-24` using `tsdb` store, `filesystem` object store, schema `v13`, and index prefix `index_` with a 24h period.
- `ruler.alertmanager_url`: `http://alertmanager:9093`, where Loki alerting rules forward when used.
- `limits_config.retention_period`: `168h` (7 days).
- `compactor`: working directory `/var/loki/compactor`, `retention_enabled: true`, and `delete_request_store: filesystem`. This enforces the retention period.

## Relationships
- `grafana.datasources.yaml`: Grafana queries Loki over the HTTP API on port 3100 (the config comments name Grafana as a consumer of that port). The datasource definition presumably points at it.
- `alertmanager.config.template.yaml`: the ruler's `alertmanager_url` targets the `alertmanager` host on port `9093`, so Loki alert rules are sent to the Alertmanager that the template configures.

## Notes
- The paths under `/var/loki` and the `alertmanager` hostname assume a container or compose-network layout. A volume is needed for `/var/loki` if data should survive restarts.
- Retention only takes effect because the compactor has `retention_enabled: true`. `limits_config.retention_period` alone is not enough.
- The ruler only forwards alerts "when used". No rule storage beyond the `rules_directory` is configured here.
