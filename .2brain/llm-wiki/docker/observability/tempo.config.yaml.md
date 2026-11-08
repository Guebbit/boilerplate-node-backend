---
source: docker/observability/tempo.config.yaml
sha256: 0a598a1a0c701722aee0fdc6500ce8f9d522d88419da926137c8eddccca127cf
generated_at: 2026-11-08T02:24:15.273845+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/tempo.config.yaml

## Purpose

Configuration for a single-process Tempo instance used in local development. It explicitly defines the HTTP/UI port, OTLP ingest endpoints, in-memory flush cadence, trace retention, and a local-disk storage backend so the tracing pipeline runs with zero external dependencies.

## Key elements

- **`server.http_listen_port`** — Tempo HTTP API/UI port (3200) on the container network.
- **`distributor.receivers.otlp`** — OTLP receivers exposed on `0.0.0.0:4318` (HTTP) and `0.0.0.0:4317` (gRPC) for trace ingestion.
- **`ingester.max_block_duration: 5m`** — In-memory block flush interval; tuned short for quick visibility in dev.
- **`compactor.compaction.block_retention: 24h`** — Traces are kept one day, then compacted away.
- **`storage.trace.backend: local`** — Uses the local filesystem backend (no S3 or object store).
- **`storage.trace.wal.path`** — Write-ahead log location (`/var/tempo/wal`) protecting in-flight data across restarts.
- **`storage.trace.local.path`** — Final trace block directory (`/var/tempo/blocks`), expected to be backed by a host volume mount.

## Relationships

No graph neighbors. This file is consumed by the Tempo process at container start; it is not imported or referenced by any other file in the dependency graph.

## Notes

- Designed strictly for local/dev use: local-disk backend, single process, short retention. Do not reuse this configuration for staging or production without swapping to a durable object-store backend and adjusting retention.
- The OTLP HTTP endpoint (4318) is the primary ingest path (expected from an OTel Collector); the gRPC endpoint (4317) is kept for tooling compatibility.
- The two storage paths (`/var/tempo/wal`, `/var/tempo/blocks`) assume a volume mount is configured in the container definition; without it, data is lost when the container is recreated.
- `max_block_duration` of 5 minutes means traces are not queryable until a block is flushed, so there is a small ingestion-to-visibility lag even in dev.
