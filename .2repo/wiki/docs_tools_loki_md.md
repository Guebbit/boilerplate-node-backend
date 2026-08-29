# docs/tools/loki.md

## Purpose

Documents how **Grafana Loki** serves as the log store in this boilerplate: the container-log pipeline (Docker and Podman), the Promtail configuration, LogQL query examples, and how log lines correlate with Tempo traces.

## Key elements

- **Log pipeline** — Describes two wiring paths: Docker JSON logs and Podman `k8s-file` (CRI) logs, both tailing via Promtail into Loki.
- **LogQL examples** — Ready-to-use selectors for `{service="api"}`, error filtering, and `trace_id` lookup in Grafana Explore.
- **Trace ↔ log correlation** — Walks through jumping between a Tempo trace and its Loki log lines (and vice-versa) using the `trace_id` field.
- **Local config reference** — Points to `.docker/observability/loki.config.yaml` (single-process, filesystem storage, 7-day retention).
- **"Works with" section** — Links to Winston (structured JSON + `trace_id`), Tempo (trace correlation), and Grafana (query surface).

## Relationships

- **`docs/tools/index.md`** — Sibling entry in the tools index; this page is listed there as the Loki tool reference.

## Notes

- **Labels are Promtail-derived, not Loki-native.** `service`, `level`, and `trace_id` only exist as queryable labels if each log line is JSON. The boilerplate relies on `process.stdout.isTTY` (not `NODE_ENV`) to choose between JSON and colourised output, so containers emit JSON and TTYs emit prose. Keying that off `NODE_ENV` would silently break all LogQL selectors with no error.
- **Podman gotcha:** the default `journald` log driver writes no file Promtail can tail. You must set `CONTAINER_LOG_DRIVER=k8s-file` and run `npm run compose:rebuild` (or `compose:restart`) before logs appear in Loki.
- **`CONTAINER_LOGS_PATH` / `PROMTAIL_CONFIG`** in `.env` must be updated to point at the Podman overlay path and the CRI pipeline stage; the Docker defaults do not work under Podman.
