---
source: docker/deploy-drill.sh
sha256: 8003ce8503c3578c1e3837f300a5b8c3d9377bf7d6dd876eb2b978e56accbbd4
generated_at: 2026-10-29T01:17:55.097265+00:00
model: ollama:qwen3.8:27b
---

# docker/deploy-drill.sh

## Purpose

End-to-end integration drill that exercises `docker/deploy.sh` against the real production Compose file using a throwaway client (generated secrets, unique project name). It verifies the full deploy → broken-deploy (auto-rollback) → second-deploy → manual `--rollback` lifecycle, asserting container state, log entries, and a live `/livez` endpoint after each step. Invoked via `npm run deploy:drill`.

## Key elements

- **`step()` / `die()`** — Print a heading or abort the drill with a message.
- **`cleanup()`** — EXIT trap. Tearing down: Compose project (with volumes), stray containers, all drill images, the client directory, and the temp build dir. Honours `DEPLOY_DRILL_KEEP` to skip cleanup. Prints a final PASS/FAIL line and exits with the original code.
- **`deploy()`** — Calls `docker/deploy.sh` with the client name and extra args; captures the exit code in `$deploy_code` without tripping `set -e`.
- **`container_of()` / `running_image()`** — Resolve the drill stack's container by service label and report the image it was created from.
- **`assert_running()` / `assert_log_tail()` / `assert_alive()`** — Post-condition checks: the app container runs the expected image, `deploys.log` ends with the expected event + image suffix, and `http://127.0.0.1:$PORT/livez` responds.
- **`derive()`** — Writes a one-line Dockerfile (`FROM <first-image>` + extra lines) and builds a tagged image on top; appends the tag to `DRILL_TAGS` for cleanup.
- **Client provisioning block** — Creates `clients/deploydrill$$/` (mode 0700), generates 15 `openssl rand -hex 32` secrets, and a `.env` with production-shaped config (profiles, ports, shop fields, VAT rates).
- **`DRILL_TAGS`** — Array of locally built image tags to force-remove in cleanup.

## Relationships

No graph neighbors are recorded. The script does shell-call `docker/deploy.sh` and invoke the container engine (`podman` by default, overridable via `CONTAINER_ENGINE`) with `docker-compose.production.yml`. Documentation cross-reference: `docs/tools/deploy-and-rollback.md#the-drill`.

## Notes

- `ENGINE` defaults to **podman**, not docker; set `CONTAINER_ENGINE=docker` to switch.
- `CLIENT` is `deploydrill$$` (PID-suffixed) so parallel runs don't collide; the port is `3996` by default (`DEPLOY_DRILL_PORT`).
- `DEPLOY_DRILL_KEEP=1` (any value) suppresses cleanup for post-mortem inspection.
- `DEPLOY_TIMEOUT` (default 300 s) is exported for `deploy.sh` to consume.
- The `setup` container must survive `--rollback` untouched — the script explicitly compares its ID before/after to enforce this.
- All `xargs -r` / `|| true` guards in `cleanup` mean a half-removed stack won't mask the original exit code.
