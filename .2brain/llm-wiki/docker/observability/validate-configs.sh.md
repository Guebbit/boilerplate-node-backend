---
source: docker/observability/validate-configs.sh
sha256: 58978b16184a589f82d63abe78cc1c1de98636507af56c66276442bc0ea50e5a
generated_at: 2026-11-14T17:12:49.088677+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/validate-configs.sh

## Purpose

Validates the Loki and Alloy configs that production actually runs by executing each tool's built-in config check (`loki -verify-config`, `alloy validate`) inside the exact Docker image named in the compose files. This catches the failure mode where an image version bump and a config the new version rejects land in separate commits. Dev-only configs are intentionally out of scope.

## Key elements

- **`image_in <compose-file> <repository>`** — Extracts the fully-qualified image tag for a given repository from a compose file. Matches the `image:` key with an optional `docker.io/` prefix stripped, so both `grafana/loki` and `docker.io/grafana/loki` resolve.
- **`check <label> <image> <docker-run-args…>`** — Runs a single validation via `docker run --rm`, mounting `docker/observability/` read-only at `/obs`. Exits 1 if no image was found.
- **Loki loop** — Resolves the `grafana/loki` image from both `docker-compose.yml` and `docker-compose.production.yml`, then validates `loki.config.yaml` against each.
- **Alloy check** — Resolves the `grafana/alloy` image from the production compose file and runs `alloy validate /conf` with the logs config (and the optional audit-forwarder file) bind-mounted into `/conf`.

## Relationships

No graph neighbors are recorded for this file. It is a standalone script that depends only on a container engine (`docker` or the podman shim) being on `PATH` at invocation time.

## Notes

- The script `cd`s to the repo root (`$(dirname "$0")/../..`) before running, so relative paths like `docker/observability` are anchored there.
- Alloy validation mounts only the specific config files needed; the broader `/obs` mount used by the Loki check is not available to Alloy by default.
- A missing image in a compose file is a hard error (exit 1), not a skip — this is deliberate so a typo in the image name fails loudly rather than silently skipping validation.
- The `set -euo pipefail` guard means any single failed `docker run` aborts the whole script before the "all configs accepted" message prints.
