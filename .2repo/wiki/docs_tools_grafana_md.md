# docs/tools/grafana.md

## Purpose

Reference documentation for Grafana's role as the unified observability UI (traces, metrics, logs) in the local dev stack. Covers access details, provisioning locations, the trace-lookup workflow, and how each signal source (Tempo, Prometheus, Loki) connects to it.

## Key elements

- **Single UI for three signals** — Tempo (traces), Prometheus (metrics), Loki (logs); all datasources are auto-provisioned, no manual setup.
- **Local access** — `http://localhost:3001`, anonymous Admin login (no password) in dev.
- **Provisioning files** — `grafana.datasources.yaml` and `grafana.dashboard-providers.yaml` under `.docker/observability/`; dashboard JSON lives in `.docker/observability/grafana/dashboards/`.
- **Trace lookup workflow** — grab `trace_id` from an app log → Explore → Tempo → paste ID → inspect span tree → jump to correlated Loki logs via the embedded link.
- **Stack overview table** — pinned image versions for Collector, Tempo, Prometheus, Alertmanager, Loki, Promtail, Grafana.
- **Admin API distinction** — `/observability/*` endpoints return a point-in-time JSON snapshot; Grafana is the tool for time-series/SRE workflows.

## Relationships

- **`docs/tools/docker-and-podman.md`** — Grafana and its companion services (Tempo, Loki, Promtail, etc.) are deployed via Docker/Podman compose; Promtail specifically reads container logs from the Docker/Podman socket to ship into Loki. All provisioning files live under the shared `.docker/` tree documented there.

## Notes

- Anonymous admin means no auth in dev — do not expose the port outside localhost.
- The derived-field config makes every `trace_id` in a Loki log a clickable Tempo link; this is configured in the Loki datasource, not in Grafana itself.
- The `/observability/*` REST endpoints are a data-layer alternative, not a replacement for Grafana's time-axis views.
