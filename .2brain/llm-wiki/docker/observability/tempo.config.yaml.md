---
source: docker/observability/tempo.config.yaml
source_sha256: 0a598a1a0c701722aee0fdc6500ce8f9d522d88419da926137c8eddccca127cf
context_sha256: 17ebc33806d68d7022aae10b367c252d41f701f9f4df6ed317dcaa35cefdb0cb
generated_at: 2026-11-22T01:34:04.924746+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/tempo.config.yaml

## Purpose
Configuration for Grafana Tempo, the distributed trace store in the local observability stack. It defines the listening ports, OTLP ingest, and storage locations explicitly, since Tempo doesn't auto-discover them. The setup is deliberately simple: a single process with local-disk storage and real OTLP ingest.

## Key elements
- `server.http_listen_port: 3200`: Tempo HTTP API/UI port inside the container network.
- `distributor.receivers.otlp`: OTLP receivers on `0.0.0.0:4318` (HTTP) and `0.0.0.0:4317` (gRPC). The comments say HTTP is the expected path for app traces via the collector, and gRPC is kept for tooling compatibility.
- `ingester.max_block_duration: 5m`: how long traces stay in memory blocks before flush. The comment says shorter values give faster visibility and less memory pressure in dev.
- `compactor.compaction.block_retention: 24h`: traces are kept for one day.
- `storage.trace.backend: local`: local filesystem backend with no external dependencies.
- `storage.trace.wal.path: /var/tempo/wal`: write-ahead log for in-flight data across restarts.
- `storage.trace.local.path: /var/tempo/blocks`: final block storage, described as mounted from a host volume.

## Relationships
- `otel-collector.config.yaml`: the collector is the expected source of app traces. Per the comments, it forwards to Tempo's OTLP HTTP receiver on port 4318.
- `grafana.datasources.yaml`: Grafana would query Tempo through its HTTP API on port 3200, so the datasource URL must match `http_listen_port`.

## Notes
- Retention is 24h and storage is local-only, so this is a dev configuration, not a production one.
- The `/var/tempo/*` paths must be backed by a mounted volume for data to survive container recreation. The mount itself is not defined in this file.
