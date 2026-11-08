---
source: docker/observability/validate-configs.sh
sha256: f320f7405b903c9d1b4fe2fccd63e5bddd13fee1b88b73541535c60c4d1ad4a7
generated_at: 2026-11-08T02:24:33.003320+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/validate-configs.sh

## Purpose

Validates every observability configuration file against the exact Docker image tag named in the relevant compose file. This prevents a situation where an image version bump and a config the new version rejects are merged independently, since each check runs the tool's own validate/parse command inside the mounted image.

## Key elements

- **`image_in(file, repository)`** — extracts the full image tag (repo:version) for a given repository name from a compose YAML file. Tolerates an optional `docker.io/` prefix.
- **`check(label, image, …)`** — wraps a single `docker run` invocation. Mounts `docker/observability/` read-only at `/obs` and `docker/` at `/docker`, streams stdout to `/dev/null`, and exits non-zero if no image was resolved.
- **Per-tool validation blocks** — sequential calls for:
  - `otelcol validate` (dev compose)
  - `loki -verify-config` (both dev and prod compose, same config file)
  - `alloy validate` (dev: single file; prod: directory containing `logs.alloy` plus an optional audit-forwarder file)
  - `promtail -check-syntax` (both `promtail.config.yaml` and `promtail.podman.config.yaml`)
  - `caddy adapt` (validates the Caddyfile without loading certificates)

## Relationships

No graph neighbors recorded.

## Notes

- Requires a running container engine (`docker` or a podman shim providing the `docker` CLI). No build step; images must already be pulled or pullable.
- The script `cd`s to the repository root (two levels up from its own location) before any relative-path mounts are resolved.
- Alloy **production** validation is structurally different from dev: it mounts `alloy.logs.config.alloy` to `/conf/logs.alloy` and points `alloy validate` at the `/conf` directory, reflecting how production loads a directory of config files rather than a single file.
- The Caddyfile being validated lives outside `docker/observability/` (at `docker/webhook-tester-tls.Caddyfile`), which is why the `docker/` directory is also mounted at `/docker`.
- `set -euo pipefail` means any single failed check aborts the whole run; there is no retry or partial-reporting logic.
