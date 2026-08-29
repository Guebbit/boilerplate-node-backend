# docs/tools/observability-reference.md

## Purpose

Quick-reference map of the boilerplate observability stack (traces, metrics, logs, alerts) with per-tool config tables. Exists so a developer or AI assistant can locate the relevant YAML config, understand each setting's intent, and know dev-vs-prod differences without reading every config file.

## Key elements

- **Architecture diagram** — Mermaid flowchart showing the full signal path: App → OTel/Tempo (traces), Prometheus/Alertmanager (metrics), Winston→stdout→Promtail→Loki (logs), all feeding Grafana on `:3001`.
- **Signal roles table** — One-row-per-signal summary: path, storage, query UI, and links to dedicated tool pages.
- **Prometheus config reference** — Scrape interval, `scrape_configs`, `rule_files`, `alertmanagers` target; pointers to `prometheus.config.yaml` and `prometheus.alert-rules.yaml`.
- **Alertmanager config reference** — Grouping/throttle knobs, `receivers` (defaults to `null` to avoid accidental notifications), `resolve_timeout`.
- **Grafana config reference** — Datasource provisioning, cross-signal links (`tracesToLogsV2`, `derivedFields`), dashboard auto-loading via provider `path`.
- **Tempo config reference** — OTLP receiver, local/WAL storage, compaction retention (default `24h`).
- **Loki config reference** — Schema (TSDB `v13`), filesystem storage, retention (`168h`), ruler→Alertmanager wiring.
- **Promtail config reference** — Two config files selected by `PROMTAIL_CONFIG` env var (Docker `json-file` vs Podman `k8s-file`); pipeline stages differ per runtime.

## Relationships

- **docs/tools/observability-layer.md** — Likely the conceptual/design companion that explains *why* the stack is shaped this way; this file is the *what/where/how* config reference. The signal roles table here links out to individual tool pages that both files reference.
- **docs/tools/opentelemetry.md** — The dedicated OTel page covers the instrumented-client and collector side in depth; this file's Traces row and Tempo section are the storage/ingest half of that same pipeline and cross-link back to it.

## Notes

- The Promtail section is the only one with a **runtime-conditional** config: `PROMTAIL_CONFIG` in `.env` swaps between the Docker and Podman YAML files. Forgetting to set it (or having a stale value) means logs won't ship correctly under the other runtime.
- Alertmanager's `receivers` default to `null` intentionally — any "no alerts received" surprise is expected behavior, not a bug.
- All retention values (Tempo `24h`, Loki `168h`, Prometheus `7d`) are tuned for local disk; prod will use object storage and longer windows, so don't treat these as policy.
- The Grafana `derivedFields` / `tracesToLogsV2` mappings assume a specific label naming convention; if you rename service labels, cross-signal jumps break silently.
