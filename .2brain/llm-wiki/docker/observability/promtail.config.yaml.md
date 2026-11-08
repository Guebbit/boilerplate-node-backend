---
source: docker/observability/promtail.config.yaml
sha256: 5c4811300f99cd15dd51180cc68b2a09c0405044ffd286b185e7759da0c03631
generated_at: 2026-11-08T02:23:56.978020+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/promtail.config.yaml

## Purpose

Promtail scrape and pipeline configuration that reads Docker `json-file` container logs from a host bind mount, parses the two-layer JSON envelope to extract application-level fields (level, service, trace_id), promotes them to LogQL labels, and pushes the result to Loki. It is the default config mounted by Docker Compose unless `PROMTAIL_CONFIG` is overridden.

## Key elements

- **`server`** – Exposes the debug/metrics HTTP endpoint on port 9080; gRPC is disabled (`grpc_listen_port: 0`).
- **`positions.filename`** – Persists read offsets at `/tmp/positions.yaml` so log tailing resumes after restarts.
- **`clients[0].url`** – Loki push endpoint (`http://loki:3100/loki/api/v1/push`).
- **`scrape_configs[0]` (`docker-containers`)** – Single static target pointing at `/var/log/host-containers/*/*-json.log`; the path is fixed regardless of which container engine is used.
- **`pipeline_stages`** – Four-stage pipeline:
  1. `json` – Unpacks Docker's outer envelope (`log`, `stream`, `time`).
  2. `output` – Replaces the line with the inner `log` payload.
  3. `json` – Parses application-level JSON (Winston/OTel fields: `level`, `service.name`, `trace_id`).
  4. `labels` – Promotes `stream`, `level`, and `service` to top-level labels for LogQL queries.

## Relationships

- **`docker/observability/promtail.podman.config.yaml`** – Podman-specific variant. Compose selects this file when `PROMTAIL_CONFIG` in `.env` is set to it; otherwise this Docker variant is the default. Both ultimately read from the same `/var/log/host-containers/` mount.

## Notes

- The `__path__` glob is intentionally **fixed** to `/var/log/host-containers/*/*-json.log`. The only thing that changes between Docker and Podman is *which* config file is mounted, not the log path.
- In stage 3, `service.name` is quoted as `'"service.name"'` because JMESPath treats dots as path separators; omitting the quotes silently breaks the extraction.
- `trace_id` is parsed into a label but is **not** promoted in stage 4—only `stream`, `level`, and `service` become queryable LogQL labels.
