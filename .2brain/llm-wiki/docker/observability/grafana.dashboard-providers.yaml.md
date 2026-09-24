---
source: docker/observability/grafana.dashboard-providers.yaml
sha256: 49cb76a3048940f7cac076006f5869c05fb9fb42d9c074d3be635ceba42fafc2
generated_at: 2026-09-23T17:13:01.218769+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/grafana.dashboard-providers.yaml

## Purpose

Grafana provisioning file that tells Grafana where to find dashboard JSON files on the filesystem. It exists so that dashboards stored in the repository are auto-loaded at container startup without any manual import in the Grafana UI.

## Key elements

- **`providers[0]` (name: `default`)** — the single provider definition; Grafana registers it under org 1 with no folder prefix.
- **`type: file`** — dashboards are sourced from a directory on disk rather than a remote URL.
- **`options.path: /var/lib/grafana/dashboards`** — the absolute path inside the Grafana container where dashboard `.json` files are expected; this directory is volume-mounted from `docker/observability/grafana/dashboards` in the Docker Compose setup.
- **`disableDeletion: false` / `editable: true`** — dashboards loaded from this path remain deletable and editable through the Grafana UI, meaning they are not "locked" provisioning artifacts.

## Relationships

- **`docker/observability/grafana.datasources.yaml`** — sibling provisioning file loaded by Grafana in the same startup phase. Both live under the same Grafana provisioning path (`/etc/grafana/provisioning/...`) and are applied independently: datasources define *where data comes from*, this file defines *where dashboards come from*. They do not reference each other directly but are typically deployed and versioned together as part of the observability stack.

## Notes

- Because `disableDeletion` is `false`, deleting a dashboard in the UI removes it permanently (Grafana won't re-provision it unless the source JSON reappears on disk). This is intentional for a dev-oriented setup but differs from a "read-only" provisioning pattern.
- The `path` value is the **in-container** path. To add or remove a dashboard, edit files under `docker/observability/grafana/dashboards/` in the repo and restart (or reload) the Grafana container.
