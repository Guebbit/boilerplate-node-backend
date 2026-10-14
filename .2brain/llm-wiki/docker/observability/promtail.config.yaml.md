---
source: docker/observability/promtail.config.yaml
sha256: 5c4811300f99cd15dd51180cc68b2a09c0405044ffd286b185e7759da0c03631
generated_at: 2026-10-14T06:51:44.695854+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/promtail.config.yaml

## Purpose

Promtail scrape and pipeline configuration that reads Docker `json-file` container logs from a host bind mount, parses both the Docker envelope and the inner Winston/OTel JSON payload, promotes key fields to labels, and pushes structured logs to Loki. It is the default Promtail config selected by the Compose stack.

## Key elements

- **server** — HTTP debug/metrics endpoint on `:9080`; gRPC disabled (`grpc_listen_port: 0`).
- **positions** — Read-offset tracking at `/tmp/positions.yaml` (ephemeral; survives only for the container's lifetime).
- **clients** — Single push endpoint: `http://loki:3100/loki/api/v1/push`.
- **scrape_configs → docker-containers** — Static target `localhost` with `__path__: /var/log/host-containers/*/*-json.log` and fixed `job: docker` label.
- **pipeline_stages** (ordered):
  1. `json` — extract `log`, `stream`, `time` from the Docker envelope.
  2. `output` — replace the raw line with the inner `log` payload.
  3. `json` — extract `level`, `service` (from `service.name`), `trace_id` from the app payload.
  4. `labels` — promote `stream`, `level`, `service` into LogQL-queryable labels.

## Relationships

- **→ `docker/observability/loki.config.yaml`** — This file is the *producer*; Loki's config is the *consumer*. The `clients.url` here must match the listen address/port in Loki's `server` block.
- **⇄ `docker/observability/promtail.podman.config.yaml`** — Sibling variant for Podman. Compose mounts *this* file by default; the podman variant is selected only when the `PROMTAIL_CONFIG` env var explicitly names it. Both share the same `/var/log/host-containers` mount path.

## Notes

- The glob path `/var/log/host-containers/*/*-json.log` is **fixed** in this config. The host-side source directory is controlled by `CONTAINER_LOGS_PATH` in `.env` (a Compose volume mapping), not here.
- Stage 3 uses JMESPath quoting (`'"service.name"'`) because the OpenTelemetry key contains a dot; without the quotes it would be parsed as a nested path and fail.
- `trace_id` is extracted but **not** promoted to a label in Stage 4 — it remains in the structured log payload, queryable via LogQL's `line_format` or `| json` but not filterable by label matcher.
- Positions live in `/tmp`; if the Promtail container is recreated (e.g., `docker compose up --force-recreate`), offset tracking resets and earlier lines may be re-ingested.
