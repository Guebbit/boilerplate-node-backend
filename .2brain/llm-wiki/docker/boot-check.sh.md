---
source: docker/boot-check.sh
source_sha256: 1f86e7ccf3d5603e74c9fff4c264a5db3db553171521ba1def66515aaa996150
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:29:19.208260+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/boot-check.sh

## Purpose
A smoke test for the production Docker image. It boots the image against a real MongoDB and checks two things a unit test cannot: the web and worker entries both start (including the fail-closed production config gate) and answer `/livez`, and the runtime `node` user cannot write under `src/` (the code must be root-owned). CI and developers run the same script, so the check cannot drift between them.

## Key elements
- **Usage**: `docker/boot-check.sh <image>`. The image argument is required. The header shows it being built with `docker build -f docker/Dockerfile --target runtime -t boot-check .`.
- **`BOOT_CHECK_PORT`**: optional env var for the host port, default `3999`. It is bound to `127.0.0.1` and maps to container port 3000.
- **Resource names**: a throwaway Docker network and `mongo`, `app` and `worker` containers, each suffixed with the shell PID (`$$`).
- **`cleanup` (trap on `EXIT`)**: force-removes the three containers and the network, and deletes the temp secrets directory.
- **Secrets setup**: creates one random base64 file for each of `token_access`, `token_refresh`, `totp`, `pii`, `webhook`, `pseudonym`, `metrics` and `device_cookie`. They are made world-readable (dir `755`, files `644`) because the container's `node` user is not the runner's uid.
- **Mongo image resolution**: extracts the pinned `docker.io/library/mongo:...@sha256:...` reference from the first matching `image:` line in the compose file one directory above the script.
- **`run_args` array**: the shared environment for app and worker. It sets the network and a read-only `/run/secrets` mount. It also sets `NODE_ENV=production`, the DB URI, URL/CORS settings, the `NODE_*_FILE` secret paths, and the legal, shop, VAT and support settings.
- **App container**: runs the image's default command with `-p` publishing.
- **Worker container**: runs `node --import tsx src/worker.ts` in the same image.
- **Checks**:
  1. Polls the app's `/livez` with `curl` from the host, up to 45 tries at 2 s intervals (about 90 s). On failure it prints the container log and exits 1.
  2. Runs a `touch` of a marker file under the app's `src/` directory via `docker exec` as the runtime user. The script fails if the touch succeeds.
  3. Polls the worker's `/livez` on `127.0.0.1:3000` from inside the container via `docker exec node -e fetch(...)`, with the same retry budget. On failure it prints the log and exits 1.

## Relationships
No graph neighbors; it is a standalone script. It reads a compose file one directory above it for the Mongo image pin, expects an image built from `docker/Dockerfile`, and its header says it is run by a CI `boot` job.

## Notes
- The app container deliberately omits `--read-only`, which production compose uses. That flag would make the write check pass trivially. The check is about file ownership, not the mount.
- Queue and cache services are intentionally not started. They degrade gracefully, and `/livez` never touches them.
- The worker has no broker configured, so it consumes nothing. Its check only proves it boots under the production config gate.
- The worker is probed from inside the container because the image has no `curl`.
- The script runs under `set -euo pipefail`. The Mongo image `sed` extraction depends on the compose file's line format.
- The script assumes all mongo `image:` lines in the compose file are identical, so it uses the first.
- The worker's `/livez` is checked only after the write-permission check.
