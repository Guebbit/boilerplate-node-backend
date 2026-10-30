---
source: docker/deploy.sh
sha256: 3e954b87470ef8e713e9ece6df60bee8d40c7f7c515d1bec872ef331e2ceb7bc
generated_at: 2026-10-29T01:18:09.781871+00:00
model: ollama:qwen3.8:27b
---

# docker/deploy.sh

## Purpose

Single-command deploy/rollback script for one client's production stack. It brings up (or re-runs) the compose-defined services against a specific image, polls until the stack is provably healthy, and — if it is not — restores the last known-good image. All successful states are appended to a per-client log that doubles as the sole rollback history.

## Key elements

- **`compose()`** — wrapper around `$ENGINE compose` that injects the client's `.env` and the production compose file for every call.
- **`container_of <service>`** — resolves a service's container ID via compose project/service labels.
- **`state_of <service>`** — returns `<status> <exit-code> <restart-count> <health>` in one line; `none` for missing containers or absent health checks.
- **`probe_ready`** — execs `node -e "fetch(...'/readyz')"` inside the `app` container (the image has no curl) to confirm readiness beyond compose health.
- **`wait_healthy <full|partial>`** — polls every 3 s until deadline (`DEPLOY_TIMEOUT`, default 240 s). `full` also requires `setup` to have exited 0; `partial` (used by rollbacks) checks only `app` + `cron`. Any restart count > 0, dead/unhealthy status, or failed `/readyz` short-circuits with failure.
- **`record <event>`** — appends `<UTC-timestamp> <event> <APP_IMAGE>` to `clients/<client>/deploys.log`.
- **`current_good`** / **`previous_good`** — read the log to find the last good image and the newest different one, respectively.
- **`run_previous <image>`** — `compose up -d --no-build --no-deps app cron` with `APP_IMAGE` overridden; deliberately skips `setup` so rollback never touches data.
- **`show_logs`** — dumps last 40 lines for `database`, `setup`, `app`, `cron` plus database health-probe output for post-failure diagnostics.
- **`prune_images`** — (no-registry path only) removes local `boilerplate-api:<tag>` images beyond the last `DEPLOY_KEEP` (default 5) good entries in the log.

## Relationships

No graph-neighbor files are recorded.

## Notes

- **Why polling, not `up --wait`**: podman-compose 1.6 accepts `--wait` but exits 0 even when a container has crashed or is unhealthy, so health is read from `inspect` manually.
- **Exit codes**: `0` = deploy healthy; `1` = new image failed, previous one restored (auto-rollback); `2` = nothing healthy is running.
- **`deploys.log` is the entire rollback record.** No other state file is consulted.
- **No-registry vs. registry path**: if no explicit image is given the script builds locally and tags with `git rev-parse --short HEAD` (appending `-dirty` on a dirty tree); if an image *is* given it pulls only when the image is not already present on the host.
- **`--no-build` on `compose up`** is deliberate: the image is already what we intend to run; compose must not rebuild over it.
- The script `cd`s to the repository root (`$(dirname "$0")/..`) so all relative paths (`clients/…`, compose file) resolve regardless of invocation directory.
- `CONTAINER_ENGINE` (default `podman`) must match whatever `npm run compose` uses in the same environment.
- Design/runbook lives in `docs/tools/deploy-and-rollback.md` (referenced in the header comment).
