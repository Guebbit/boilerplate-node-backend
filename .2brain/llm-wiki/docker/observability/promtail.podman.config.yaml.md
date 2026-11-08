---
source: docker/observability/promtail.podman.config.yaml
sha256: b0a8db388df5b317e111fb51c8cd31b5eb0fb1fdb86a568c3594b4e4af777de2
generated_at: 2026-11-08T02:24:06.476604+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/promtail.podman.config.yaml

## Purpose

Promtail scrape configuration for collecting container logs when the container engine is **rootless Podman** using the `k8s-file` log driver. It exists as the Podman counterpart to `promtail.config.yaml` (the Docker default) because Podman stores logs at a different glob path and writes them in CRI format rather than Docker JSON. Selected at runtime via `PROMTAIL_CONFIG` in `.env`.

## Key elements

- **`server`** — Exposes Promtail's debug/metrics HTTP endpoint on port 9080; gRPC is disabled (`grpc_listen_port: 0`).
- **`positions`** — Persists read offsets to `/tmp/positions.yaml` so restarts resume from the last processed line.
- **`clients`** — Single Loki push target at `http://loki:3100/loki/api/v1/push`.
- **`scrape_configs` → `podman-containers`** — Tails the glob `/var/log/host-containers/*/userdata/*.log`, matching Podman's `overlay-containers/<id>/userdata/<id>.log` layout under a host bind mount.
- **`pipeline_stages`** — Three-stage pipeline:
  1. `cri` — Strips the CRI envelope (`<RFC3339Nano> <stream> <flag> <body>`) written by Podman's k8s-file driver.
  2. `json` — Extracts `level`, `service` (from the dotted key `"service.name"`), and `trace_id` from the Winston JSON payload.
  3. `labels` — Promotes `stream`, `level`, and `service` to Loki labels for LogQL filtering.

## Relationships

- **`docker/observability/promtail.config.yaml`** — The Docker-equivalent config. Both are mounted at `/var/log/host-containers` inside the Promtail container; the only structural differences are the `__path__` glob and the presence of the `cri` parser stage here (Docker logs are already in a JSON format that needs no CRI unwrap).

## Notes

- Podman's default log driver is **journald**, which produces no file for Promtail to tail. You must set `CONTAINER_LOG_DRIVER=k8s-file` (see `.env-example`) or the `userdata/*.log` files will not exist.
- The `service` JSON expression uses JMESPath double-quoting (`'"service.name"'`) because the key contains a dot; omitting the quotes silently matches a top-level key named `service` instead.
- Both configs share the same mount point and Loki endpoint; if you add a new pipeline stage to one, consider mirroring it in the other to keep behavior consistent across engines.
