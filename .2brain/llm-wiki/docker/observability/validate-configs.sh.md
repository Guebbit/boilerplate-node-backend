---
source: docker/observability/validate-configs.sh
generated_at: 2026-11-22T01:34:29.674181+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/validate-configs.sh

## Purpose
Validates the production observability configs (Loki and Alloy) by running each tool's own check inside the image that the base compose file pins. This way, an image version bump and a config the new version rejects can't land separately. Dev-only configs are deliberately not checked, since a bad one fails immediately on `compose up`.

Run with: `bash docker/observability/validate-configs.sh`. Requires a container engine (`docker` or the podman shim).

## Key elements
- `image_in file repository`: extracts the first `image:` value for a repository (e.g. `grafana/loki`) from a compose file with `sed`. An optional `docker.io/` prefix is ignored, so both spellings match.
- `check label image ...`: prints `== label (image)`, fails with exit 1 if the image is empty, then runs `docker run --rm` with the `docker/observability` folder mounted read-only at `/obs`. The remaining arguments are the run tail, and stdout is discarded.
- Loki check: runs the image pinned in the base compose file with `-config.file=/obs/loki.config.yaml -verify-config`, where `/obs/loki.config.yaml` is the mounted `loki.config.yaml` from the observability folder.
- Alloy check: mounts `alloy.logs.config.alloy` as `/conf/logs.alloy` (read-only) and runs `alloy validate /conf`. This mirrors production, which loads a directory.

## Relationships
This file has no graph neighbors and no dependencies on other files in the graph. It is a standalone script.

## Notes
- The script `cd`s to the repo root (two levels above its own directory), so it can be run from anywhere.
- It uses `set -euo pipefail`. The first failing check aborts the run, and `all configs accepted` is printed only if every check passes.
- Because stdout is sent to `/dev/null`, only stderr and the `==` progress lines are visible.
- The comment says the optional audit forwarder is empty by default, so only the logs config is mounted for Alloy.
- The Loki image is passed twice in the call (once as the `image` argument to `check`, once as part of the `docker run` tail). This is intentional, because `check` shifts off only the label and image.
