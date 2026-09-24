---
source: docker/observability/promtail.config.yaml
sha256: 9ebbcadb6f4f23fc2c5fce96351316b89b29cb188ca122aeea9666ec0fe2e940
generated_at: 2026-09-23T17:14:02.922293+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/promtail.config.yaml

## Purpose

Promtail configuration that scrapes Docker container `json-file` logs from a host bind mount, parses the nested JSON envelopes into structured fields, promotes key fields to LogQL-filterable labels, and pushes the result to a local Loki instance.

## Key elements

- **`server`** – HTTP endpoint on port 9080 for Promtail's own metrics/debug; gRPC disabled (`grpc_listen_port: 0`).
- **`positions`** – Offset state written to `/tmp/positions.yaml` so a restarted container resumes from the last read line.
- **`clients`** – Single push target: `http://loki:3100/loki/api/v1/push`.
- **`scrape_configs[0]`** (`job: docker`) – Glob `__path__`: `/var/log/host-containers/*/*-json.log`; targets `localhost`.
- **`pipeline_stages`** (4 stages):
    1. `json` – Unwrap Docker's outer envelope (`log`, `stream`, `time`).
    2. `output` – Replace the line with the inner `log` payload.
    3. `json` – Parse the application-level JSON (Winston fields: `level`, `service`, `trace_id`).
    4. `labels` – Promote `stream`, `level`, `service` to LogQL labels.

## Relationships

- **`docker/observability/loki.config.yaml`** – Loki is the ingestion target; its `auth_enabled` / route config determines whether this push succeeds. The `http://loki:3100` URL in this file must match Loki's listen address.
- **`docker/observability/promtail.podman.config.yaml`** – Sibling variant selected when the `PROMTAIL_CONFIG` env var points to it (Podman log layout differs). This file is the default when no override is set.

## Notes

- The `__path__` glob is **fixed** in the container; the host-side directory is controlled solely by `CONTAINER_LOGS_PATH` in `.env`. Changing that variable does not require editing this file.
- `trace_id` is extracted in stage 3 but **not** promoted to a label in stage 4 — it is available as a structured field in the log line but not directly filterable via LogQL label matchers.
- The positions file lives in `/tmp`; without a named volume on that path, a container restart resets read offsets and may re-ingest recent lines.
- Pipeline assumes a Winston-style JSON payload. Non-JSON application logs will pass through stage 2 as-is (raw string) and simply lack the `level`/`service` labels.
