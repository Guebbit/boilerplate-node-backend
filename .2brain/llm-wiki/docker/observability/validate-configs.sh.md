---
source: docker/observability/validate-configs.sh
sha256: f320f7405b903c9d1b4fe2fccd63e5bddd13fee1b88b73541535c60c4d1ad4a7
generated_at: 2026-10-29T01:19:13.548591+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/validate-configs.sh

## Purpose

Validates every observability tool config (otel-collector, Loki, Alloy, Promtail, Caddy) against the **exact image tag** named in the compose file that mounts it. This prevents a scenario where an image version bump and a config the new version rejects land in separate commits.

## Key elements

- **`image_in <compose-file> <repository>`** — Extracts the image tag for a given repository from a compose file via `sed`. Matches with or without the `docker.io/` registry prefix.
- **`check <label> <image> [docker-run args…]`** — Runs a one-off container with the observability config directory mounted read-only at `/obs` (and `docker/` at `/docker`), executing the tool's native validation command. Exits non-zero if no image was found.
- **Per-tool validation calls** — Each tool uses its own syntax-check subcommand:
  - `otelcol validate --config=…`
  - `loki -config.file=… -verify-config` (run against **both** dev and prod images)
  - `alloy validate` (dev: single file; prod: a directory with a separately mounted `logs.alloy`)
  - `promtail -config.file=… -check-syntax` (two config variants)
  - `caddy adapt --adapter caddyfile` (parse-only; does not load certs)

## Relationships

No graph neighbors are recorded. The script reads `docker-compose.yml` and `docker-compose.production.yml` (image tags) and the config files under `docker/observability/` (and `docker/webhook-tester-tls.Caddyfile`) as inputs.

## Notes

- The script `cd`s to the repo root (two levels up from its own directory) before running, so all paths are repo-relative.
- `set -euo pipefail` means the first failed check aborts the run; output is sent to `/dev/null` on the container side — only the `== label (image)` echo and the final success line reach stdout.
- Production Alloy is validated as a **directory** (`/conf`), with `alloy.logs.config.alloy` bind-mounted to `/conf/logs.alloy`. The audit-forwarder file is expected to be empty/absent by default.
- The header comment mentions a "podman shim" as an alternative container engine; the code itself calls `docker run` unconditionally.
- Caddy's `adapt` command only parses the Caddyfile; it does **not** attempt to load or verify the referenced TLS certificates.
