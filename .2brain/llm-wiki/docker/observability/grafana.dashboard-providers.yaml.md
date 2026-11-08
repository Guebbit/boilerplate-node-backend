---
source: docker/observability/grafana.dashboard-providers.yaml
sha256: 49cb76a3048940f7cac076006f5869c05fb9fb42d9c074d3be635ceba42fafc2
generated_at: 2026-11-08T02:21:52.464985+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/grafana.dashboard-providers.yaml

## Purpose

Grafana provisioning file that instructs the Grafana instance to auto-load dashboard JSON definitions from a mounted filesystem path. It eliminates the need to manually import dashboards through the UI—any `.json` file placed under the configured directory is picked up automatically at startup.

## Key elements

- **`providers[0]` (name: `default`)** — The sole provider definition; binds dashboards to org 1, the root folder, and the `file` source type.
- **`path: /var/lib/grafana/dashboards`** — The container-internal directory Grafana scans for dashboard JSON files. The Docker setup mounts the host directory `docker/observability/grafana/dashboards` here.
- **`disableDeletion: false`** — Allows users to delete auto-loaded dashboards from the Grafana UI (they will reappear on next restart).
- **`editable: true`** — Permits in-UI editing of the loaded dashboards without being overridden by the provisioning file.

## Relationships

- **`docker/observability/grafana.datasources.yaml`** — Sibling provisioning file consumed by the same Grafana instance. Together they form the full provisioning bundle (datasources + dashboards) that is mounted into the container; neither file imports the other, but both must be present for a working observability stack.

## Notes

- Adding a new dashboard only requires dropping a JSON file into `docker/observability/grafana/dashboards/` on the host; no restart or UI import is needed (Grafana watches the directory).
- Because `disableDeletion` is `false`, a dashboard deleted in the UI will silently re-appear after a Grafana restart—a common source of confusion when debugging "why did my dashboard come back?"
- The `folder: ''` field means all provisioned dashboards land in the root folder. To group them, set a named folder (which must already exist in Grafana).
