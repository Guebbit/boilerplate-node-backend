---
source: docker/observability/grafana.dashboard-providers.yaml
source_sha256: 49cb76a3048940f7cac076006f5869c05fb9fb42d9c074d3be635ceba42fafc2
context_sha256: 6e2c0fdb7f43f8321f0bbca2e3240d04e94c84e62f7205a5430d888898ab993b
generated_at: 2026-11-22T01:32:02.255795+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/grafana.dashboard-providers.yaml

## Purpose
Grafana provisioning file that registers a dashboard provider so Grafana automatically loads dashboard JSON files from a mounted directory on startup. This gives the local observability stack repository dashboards with no manual import steps.

## Key elements
- `apiVersion: 1`: Grafana provisioning schema version.
- `providers[0]` named `default`:
  - `orgId: 1`, `folder: ''`: dashboards go into org 1 and the General (root) folder.
  - `type: file`: dashboards are read from files on disk.
  - `disableDeletion: false`: dashboards provisioned from files can be deleted in Grafana.
  - `editable: true`: provisioned dashboards can be edited in the UI.
  - `options.path: /var/lib/grafana/dashboards`: the container directory scanned for dashboard JSON.

## Relationships
- Sibling of `grafana.datasources.yaml`. Both are Grafana provisioning files in the same directory. This file registers where dashboards come from, and the datasources file defines the data sources those dashboards would query. The two files do not reference each other.
- The `path` is mounted from `docker/observability/grafana/dashboards` (per the in-file comment). The mount itself is defined outside this file.

## Notes
- The `path` value is a container-side path. Changing it requires a matching change to the volume mount.
- With `editable: true`, UI changes are not written back to the JSON files.
