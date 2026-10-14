---
source: docker/observability/promtail.podman.config.yaml
sha256: b0a8db388df5b317e111fb51c8cd31b5eb0fb1fdb86a568c3594b4e4af777de2
generated_at: 2026-10-14T06:52:01.607689+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/promtail.podman.config.yaml

## Purpose

Promtail scrape configuration for environments using **rootless Podman** instead of Docker. Podman's `k8s-file` log driver writes CRI-formatted logs to a different path layout than Docker's JSON driver, so a separate Promtail config is required. It is selected at runtime via `PROMTAIL_CONFIG=promtail.podman.config.yaml` in `.env`.

## Key elements

- **`server`** – HTTP debug/metrics endpoint on port 9080; gRPC disabled (`grpc_listen_port: 0`).
- **`positions`** – Persisted read-offset file at `/tmp/positions.yaml` so restarts resume from the last consumed line.
- **`clients`** – Single Loki push target: `http://loki:3100/loki/api/v1/push`.
- **`scrape_configs[0]`** (`job: podman-containers`) – Tails all Podman container log files via the glob `/var/log/host-containers/*/userdata/*.log` (one `<container-id>.log` per container under the `overlay-containers` layout).
- **`pipeline_stages`** – Three-stage pipeline:
  1. `cri` – strips the CRI envelope (`<RFC3339Nano> <stream> <flag> <message>`) to extract timestamp, stream, and body.
  2. `json` – parses the app-level JSON payload (Winston fields: `level`, `service.name`, `trace_id`).
  3. `labels` – promotes `stream`, `level`, and `service` to Loki labels for LogQL filtering.

## Relationships

- **`docker/observability/promtail.config.yaml`** – The Docker-engine equivalent of this file. They are mutually exclusive alternatives; only one is active depending on the `PROMTAIL_CONFIG` value. The only substantive differences are the `__path__` glob and the use of the `cri` stage here versus Docker's native JSON log format there.
- **`docker/observability/loki.config.yaml`** – The Loki instance that receives log entries pushed by this Promtail (`clients[0].url`). Loki's storage and retention settings defined there determine what is available for querying.

## Notes

- Podman defaults to the **journald** log driver, which produces no tailable file. The stack must set `CONTAINER_LOG_DRIVER=k8s-file` (see `.env-example`) for this config to find any logs at all.
- Both this file and `promtail.config.yaml` are bind-mounted at `/var/log/host-containers` regardless of engine, so the host-side mount path is identical; only the glob and parser differ.
- In the `json` stage, the OpenTelemetry key `service.name` contains a dot, so it must be JMESPath-quoted (`'"service.name"'`)—a common source of silent parse failures if the quoting is removed.
- `positions.filename` lives in `/tmp/`, which is ephemeral in most container runtimes; restarting the Podman container resets offsets and may cause a small re-read.
