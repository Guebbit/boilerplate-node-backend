---
source: docker/deploy.sh
sha256: 3e954b87470ef8e713e9ece6df60bee8d40c7f7c515d1bec872ef331e2ceb7bc
generated_at: 2026-11-08T02:20:15.732542+00:00
model: ollama:qwen3.8:27b
---

# docker/deploy.sh

## Purpose

Single-client production deploy script. It brings up (or rolls back) one client's compose stack via podman or docker, verifies the stack is genuinely healthy (setup exited 0, app and cron are running/healthy, `/readyz` responds), and automatically reverts to the previous good image on failure. The client's `deploys.log` is the sole record of what to roll back to.

## Key elements

- **`compose()`** – Thin wrapper that calls `$ENGINE compose` with the client's `.env` file and the production compose file.
- **`container_of(service)`** – Resolves a service's container ID via project/service labels.
- **`state_of(service)`** – Returns `status exit-code restart-count health` for one container (or a "missing" sentinel).
- **`probe_ready()`** – Hits `/readyz` from inside `app` using `node -e "fetch(...)"` (image has no curl).
- **`wait_healthy(scope)`** – Polls loop (default 240 s). `full` scope also requires `setup` to have exited 0. Fails fast on crash-loop restarts, exited/dead states, or unhealthy healthchecks.
- **`record(event)`** – Appends `<UTC timestamp> <event> <APP_IMAGE>` to `clients/<client>/deploys.log`.
- **`current_good()` / `previous_good()`** – Read the last / second-to-last distinct image from `deploys.log`.
- **`run_previous(image)`** – `compose up -d --no-build --no-deps app cron` with a given image; deliberately skips `setup` so rollback never touches data.
- **`show_logs()`** – Dumps `--tail 40` for database, setup, app, cron plus database health-probe output for diagnostics.
- **`prune_images()`** – Removes local `boilerplate-api:<tag>` images beyond the last `$KEEP` good ones (no-registry path only).
- **Main flow** – Two modes: `deploy` (build-or-pull → `up --no-build` → `wait_healthy full` → record or auto-rollback) and `--rollback` (`run_previous` → `wait_healthy partial` → record).

## Relationships

- **`docker-compose.production.yml`** – The compose file this script orchestrates. Referenced via `DEPLOY_COMPOSE_FILE` (defaults to `docker-compose.production.yml`) and passed to every `compose()` call with `-f`. Services defined there (`setup`, `app`, `cron`, `database`) are the ones this script starts, inspects, and health-checks.

## Notes

- **Container engine defaults to podman**, not docker. Set `CONTAINER_ENGINE=docker` to switch.
- **Health is read via `inspect`, not `up --wait`**, because podman-compose 1.6's `--wait` exits 0 even when a container has crashed or is unhealthy.
- **`--no-build` is always passed to `up`** to prevent compose from silently rebuilding over the intended image.
- **Exit codes are the contract:** 0 = healthy, 1 = new image failed but auto-rollback restored the previous one, 2 = nothing healthy is running (no previous image or rollback also failed).
- **`deploys.log` is append-only** and is the single source of truth for rollback targets; there is no external state store.
- **Client name is validated** against `^[a-z0-9][a-z0-9_-]*$`; a valid `clients/<client>/.env` must exist before any action.
- **`prune_images` strips the `localhost/` prefix** that podman adds to locally-built image refs before comparing against the log.
- The script `cd`s to the repo root (parent of `docker/`) so all relative paths resolve from there.
