---
source: docker/deploy.sh
source_sha256: cec6f198eac5c07b50ef253a0430b9aa4364f40af7571ba54ff84abc63691749
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:29:56.445554+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/deploy.sh

## Purpose
Bash script that deploys one client's production compose stack, checks it came up healthy, and automatically reverts to the previous good image if it did not. It supports an explicit rollback mode. Every good state is appended to the client's `deploys.log`, which is the only record of what to go back to. The script's header comment points to `docs/operate/deployment-hardening.md` for the design and runbook.

## Key elements
- **Usage**: `docker/deploy.sh <client> [image]` deploys. With no image it builds `app` locally and tags it `boilerplate-api:<git sha>`, with `-dirty` appended if the tree has changes. `docker/deploy.sh <client> --rollback` re-runs the previous good image without `setup`.
- **Environment**: `CONTAINER_ENGINE` (podman by default, or docker), `DEPLOY_TIMEOUT` (default 240 s), `DEPLOY_KEEP` (default 5 local images kept). `COMPOSE_PROFILES` is read by compose; when `backup` is among them, the backup image is built and checked as well.
- **Exit codes**: `0` good. `1` the new image failed and the previous one is running again. `2` nothing healthy is running. `64` bad usage or missing env file for the client.
- `compose()`: wraps `$ENGINE compose --env-file clients/<client>/.env -f compose.yaml -f compose.production.yaml`.
- `service_active()`: checks a service against `compose config --services`, so profile handling is left to compose.
- `state_of()` / `container_of()`: find a container by compose project and service labels, then read status, exit code, restart count and health with `inspect`.
- `probe_ready()`: runs `fetch('/readyz')` inside `app` with `node -e`, because the image has no curl.
- `wait_healthy(full|partial)`: polls every 3 s until the timeout.
  - **Services checked**: `app`, `worker`, `worker-heavy` and `cron`. `full` also requires `setup` to have exited 0, and `backup` to be up when its profile is on. `partial` is used for rollbacks.
  - **Failure conditions**: it returns 1 on any restart, an exited, stopped, dead or removing container, or an unhealthy one. It also fails on timeout.
  - **Success condition**: nothing pending and `/readyz` answers.
- `record()` / `current_good()` / `previous_good()`: write and read `<UTC time> <deploy|auto-rollback|rollback> <image>` lines in the log.
- `run_previous()`: `compose up -d --no-build --no-deps` for only `app`, `worker`, `worker-heavy` and `cron`.
- `show_logs()`: prints the last 40 log lines per service, plus the database's health probe output.
- `prune_images()` / `prune_backup_images()`: remove old local images. `prune_images` keeps the last `$KEEP` good images and the `latest` tag. `prune_backup_images` keeps `latest` and the current `BACKUP_IMAGE`.

## Relationships
No graph neighbors. The script is standalone and interacts only with the container engine, `git`, and the compose files and per-client env and deploy log files it reads and writes at runtime.

## Notes
- The client name must match `^[a-z0-9][a-z0-9_-]*$`.
- The explicit `-f` flags disable compose's auto-loading of `compose.override.yaml`, so the dev stack cannot be layered onto a server.
- Health is polled via `inspect` instead of `up --wait`. podman-compose 1.6 exits 0 for crashed or unhealthy containers even with `--wait`.
- Any container restart counts as a crash loop and fails the deploy.
- With a user-supplied image, the script pulls only if the image is missing locally and does not prune. Local pruning happens only on the build-here path.
- The backup image is always built locally and tagged with the sha, never pulled from a registry.
- `compose up` failing does not abort the script. It prints logs and falls through to the health check and the rollback path.
- With no previous good image, a failed deploy exits 2. A failed rollback also exits 2.
- Rollback never runs `setup`, so it does not touch the data.
