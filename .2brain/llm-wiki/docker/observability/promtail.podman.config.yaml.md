---
source: docker/observability/promtail.podman.config.yaml
sha256: 0979c6a74bedca6716da99f3799d57fd9335a58329d63e9cc9566239addd6166
generated_at: 2026-09-23T17:14:11.752171+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/promtail.podman.config.yaml

## Purpose

Promtail scrape configuration for environments using rootless Podman with the `k8s-file` log driver. It exists because Podman stores container logs under a different path layout and writes them in CRI format (rather than Docker's JSON-line format), so a separate parse pipeline and glob pattern are required. It is the Podman counterpart to `promtail.config.yaml` (the Docker default) and is selected via `PROMTAIL_CONFIG=promtail.podman.config.yaml` in `.env`.

## Key elements

- **`server`** — Exposes the Promtail HTTP debug/metrics endpoint on port 9080; gRPC is disabled (`grpc_listen_port: 0`).
- **`positions`** — Persists read offsets to `/tmp/positions.yaml` so restarts resume from the last processed line.
- **`clients`** — Push target: `http://loki:3100/loki/api/v1/push`.
- **`scrape_configs[0]` (`podman-containers`)** — Tails `/var/log/host-containers/*/userdata/*.log`, the layout produced by Podman's `k8s-file` driver (one `<container-id>.log` per container under `overlay-containers/<id>/userdata/`).
- **Pipeline stages:**
  - `cri` — Strips the CRI envelope (`<RFC3339Nano> <stream> <flag> <message>`) to extract timestamp, stream, and body.
  - `json` — Extracts `level`, `service`, `trace_id` from the Winston JSON payload.
  - `labels` — Promotes `stream`, `level`, `service` to Loki labels for LogQL filtering.

## Relationships

- **`docker/observability/promtail.config.yaml`** — Docker-format equivalent. Both configs are mounted at `/var/log/host-containers` inside the Promtail container; the only differences are the glob pattern and the parser stage (this file uses `cri`, the Docker file uses Docker-JSON parsing). Selection is controlled by the `PROMTAIL_CONFIG` environment variable.
- **`docker/observability/loki.config.yaml`** — Loki's own config. This file's `clients` block points at the Loki instance (`loki:3100`) that is defined and served by that config. Loki receives the pushed log entries and applies its own retention/ingestion rules.

## Notes

- Podman's **default** log driver is `journald`, which produces no file for Promtail to tail. The stack must explicitly set `CONTAINER_LOG_DRIVER=k8s-file` (see `.env-example`) or no log files will exist at the glob path.
- The glob `/var/log/host-containers/*/userdata/*.log` is engine-specific; swapping to `promtail.config.yaml` without also changing `CONTAINER_LOGS_PATH` and the driver will result in zero logs scraped.
- `positions` lives in `/tmp`, so it is ephemeral across container rebuilds — Promtail will re-tail from the beginning of the log file on a fresh container.
