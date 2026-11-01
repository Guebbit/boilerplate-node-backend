---
source: docker-compose.test.yml
sha256: e5b7616f1cc1fa73794afc3366793c5deb56a04953f0ae97849e2a8a5433b345
generated_at: 2026-10-07T23:46:55.946836+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.test.yml

## Purpose

Composable gate stack that proves the external-service code path (`NODE_TEST_MONGO_URI` / `NODE_TEST_REDIS_URL`) works end-to-end against services the app container did not start itself. It is the "wired" counterpart to the hermetic CI gate (which builds the image and runs `npm run complete` with no external services). Intended for manual pre-merge verification, not as a second CI job.

## Key elements

- **`name: boilerplate-node-backend-gate`** — explicit compose project name. Without it, Compose derives the name from the current directory, colliding with `docker-compose.yml` and causing container-name conflicts (shared `redis`/`database` names).
- **`services.mongo`** — `mongo:8` (pinned by digest) running as a single-member replica set (`--replSet rs0`). No named volume (ephemeral scratch). The healthcheck performs `rs.initiate` with host `mongo:27017` (service name, not `localhost`) so the `gate` container can reach it.
- **`services.redis`** — `redis:7-alpine` (pinned by digest) with a `redis-cli ping` healthcheck.
- **`services.gate`** — builds from `docker/Dockerfile`, sets `NODE_TEST_MONGO_URI`, `NODE_TEST_REDIS_URL`, and `JEST_WORKERS` (default 8), then runs `npm run complete`. `depends_on` both services with `condition: service_healthy`. No bind mounts (deliberate; see Notes).
- **Invocation** — `npm run compose -- -f docker-compose.test.yml run --rm -T gate` (the `-T` flag is mandatory; see Notes).

## Relationships

- **`docker-compose.production.yml`** — shares the same `docker/Dockerfile` build context. The explicit `name:` field ensures this stack's containers are namespaced separately from every other compose file in the repo (dev, production), so running the gate never tears down or duplicates sibling stacks.

## Notes

- **`-T` is not optional.** `podman-compose run` allocates a PTY by default regardless of any `tty:` key in the file. Under a PTY, the VitePress build-progress spinner redraws per file, turning an ~8 s `docs:build` into a 15+ min CPU-bound loop. `docker run` (CI's direct path) is unaffected.
- **Do not remove `name:`.** Verified failure mode: running this file without it stops and recreates the main dev stack's `redis`/`database` containers.
- **No bind mounts, by design.** A bind mount + `--userns=keep-id` (rootless-Podman fix) remaps the in-container process uid, which then loses write access to the image's root-owned `/app` (e.g. `tsc`'s `dist/`). The two workarounds conflict, so the gate proves the path via streamed stdout instead of a mounted file.
- **`JEST_WORKERS` is capped at 8 by default.** The suite's worker-pool sizing script (`scripts/testing/machine-budget.ts`) reads host free memory; on a dev box already running the main stack this over-commits and the kernel OOM-kills a worker mid-suite (confirmed via `dmesg`). Override via `.env` if needed.
- **Mongo healthcheck has a side effect.** The `mongosh` eval both checks readiness and initiates the replica set on first pass (`rs.initiate` in a `try/catch`). Subsequent checks just `ping`.
