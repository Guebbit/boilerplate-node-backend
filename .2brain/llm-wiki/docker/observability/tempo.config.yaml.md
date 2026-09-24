---
source: docker/observability/tempo.config.yaml
sha256: 0a598a1a0c701722aee0fdc6500ce8f9d522d88419da926137c8eddccca127cf
generated_at: 2026-09-23T17:14:19.299580+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/tempo.config.yaml

## Purpose

Tempo server configuration for the local development stack. It pins all non-default settings—listening ports, OTLP ingest endpoints, block lifecycle, and the local-disk storage backend—so Tempo can run as a single container with zero external dependencies while still accepting real OTLP traffic from the collector.

## Key elements

- **`server.http_listen_port: 3200`** — HTTP API / UI port exposed on the container network (used by Grafana for trace queries).
- **`distributor.receivers.otlp`** — OTLP ingest endpoints: HTTP on `0.0.0.0:4318`, gRPC on `0.0.0.0:4317`. Both are enabled; HTTP is the primary path from the collector, gRPC is kept for tooling.
- **`ingester.max_block_duration: 5m`** — Flush interval for in-memory trace blocks. Kept short in dev for faster visibility.
- **`compactor.compaction.block_retention: 24h`** — Traces are discarded after one day (dev-only retention).
- **`storage.trace`** — `backend: local` with WAL at `/var/tempo/wal` and final blocks at `/var/tempo/blocks`. Both paths are expected to be backed by a host volume mount.

## Relationships

- **`docker/observability/otel-collector.config.yaml`** — The OTel Collector exports traces to this Tempo instance via OTLP HTTP (port 4318) or gRPC (port 4317), matching the `distributor` endpoints defined here.
- **`docker/observability/grafana.datasources.yaml`** — Grafana's Tempo datasource points to the HTTP API on port 3200 (the `server.http_listen_port` defined here) to query and render traces.

## Notes

- Both OTLP ports bind to `0.0.0.0`, which is required for cross-container networking inside the Docker network; they are not intended for host-exposed access.
- The 24-hour retention and 5-minute flush are deliberate dev-simplification choices—do not treat them as production defaults.
- The `/var/tempo/` paths assume a named or bind volume is mounted in the Docker Compose service definition; without that mount, traces are lost on container restart (WAL only helps within a single container lifetime).
