---
source: docker-compose.test.yml
sha256: 9424378730aa9c689407a9ec1c419096cda592b0fb52c249a059491a5ecbdc0e
generated_at: 2026-11-08T02:17:28.416430+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.test.yml

## Purpose

A hand-run compose stack that proves the external-service branch (`NODE_TEST_MONGO_URI` / `NODE_TEST_REDIS_URL`) works end-to-end against services the container did not start itself. It is the "WIRED" counterpart to the hermetic CI gate (which builds the image and runs `npm run complete` with no services). It is deliberately **not** a second CI job; you run it by hand before merging changes to the env-var path.

## Key elements

- **`name: boilerplate-node-backend-gate`** — Pins the compose project name so this stack's container names never collide with `docker-compose.yml`'s derived project name (same directory). Removing it will stop/recreate the main dev stack's containers.
- **`services.mongo`** — Pinned `mongo:9.0.4` image, started as a single-member replica set (`--replSet rs0`). No volume, no seed data. The healthcheck performs `rs.initiate` on first probe (member host is the compose service name `mongo:27017`, not `localhost`).
- **`services.redis`** — Pinned `redis:7-alpine` image; healthcheck is `redis-cli ping`.
- **`services.gate`** — Builds from `docker/Dockerfile`, injects `NODE_TEST_MONGO_URI` and `NODE_TEST_REDIS_URL` pointing at the sibling services, and runs `npm run complete`. No bind mounts (avoids the `--userns=keep-id` / root-owned `/app` conflict). `JEST_WORKERS` defaults to `8` to prevent OOM from host-memory-based pool sizing.
- **`depends_on` with `condition: service_healthy`** — Gate waits for both `mongo` and `redis` healthchecks to pass before starting.

## Relationships

- **`docker-compose.yml`** — Lives in the same directory; without the explicit `name:` above, both files would derive the same project name and this stack would tear down the main dev stack's `redis`/`database` containers.
- **`docker/Dockerfile`** — The `gate` service's `build.dockerfile`; the test runs inside the production image.
- **`src/infrastructure/runtime/ephemeral-mongo.ts`** — The Mongo env-var branch (`NODE_TEST_MONGO_URI`) that this stack exercises against a live, externally-started MongoDB.
- **`tests/cluster/support/redis.ts`** — The Redis env-var branch (`NODE_TEST_REDIS_URL`) that this stack exercises against a live, externally-started Redis.
- **`scripts/testing/machine-budget.ts`** — Computes Jest worker count from host free memory; the `JEST_WORKERS` env in the `gate` service overrides its output to avoid OOM-kills when the host is already loaded.

## Notes

- **`-T` on the CLI is mandatory**, not just recommended. `podman-compose run` allocates a pty regardless of any `tty:` key in the file; without `-T`, a vitepress progress-spinner repaint loop turns an 8-second build into 15+ minutes of CPU burn. Plain `docker run` (what CI uses directly) does not have this issue.
- **No bind mounts, by design.** Attempting one requires `--userns=keep-id` (rootless-podman), which remaps the in-container process to your uid and breaks write access to the root-owned `/app/dist` that `tsc` needs. The test proves correctness via streamed stdout instead.
- **Usage:**
  ```
  npm run compose -- -f docker-compose.test.yml run --rm -T gate
  npm run compose -- -f docker-compose.test.yml down -v
  ```
- The stack is disposable: no named volumes, no seed data. `docker down -v` is expected cleanup.
