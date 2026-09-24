---
source: docker-compose.test.yml
sha256: bb8610001fda7bdb060c8e5a89feff85474315658980c2569ecc7a5008e6a9ef
generated_at: 2026-09-23T17:12:02.320521+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.test.yml

## Purpose

Complementary proof to the hermetic CI gate: verifies that the `NODE_TEST_MONGO_URI` / `NODE_TEST_REDIS_URL` env-var branch works end-to-end when the app talks to externally-supplied services (the same shape GitHub Actions `services:` or any CI system provides a database). It is a manual, by-hand check run before merging changes to that branch — not a second CI job.

## Key elements

- **`name: boilerplate-node-backend-gate`** — Explicit project name. Without it, Compose derives the name from the directory, colliding with the main dev stack's `docker-compose.yml` and clobbering its `redis`/`database` containers. Do not remove.
- **`services.mongo`** (`mongo:8`, no volume, no seed) — Scratch Mongo for one gate run; healthcheck via `mongosh` ping. Distinct from the persistent `database` service in the dev compose file.
- **`services.redis`** (`redis:7-alpine`) — Scratch Redis; healthcheck via `redis-cli ping`.
- **`services.gate`** — Builds the same `docker/Dockerfile` used by CI, sets `NODE_TEST_MONGO_URI`, `NODE_TEST_REDIS_URL`, and a pinned `JEST_WORKERS` (default 8) to avoid host-level OOM from the memory-based worker-sizing heuristic. Runs `npm run complete`. `depends_on` both services with `condition: service_healthy`.
- **No bind mounts** — Deliberate; `--userns=keep-id` (rootless-podman) and a root-owned image conflict on `tsc`'s `dist/` output. Results are read from streamed stdout instead.

## Relationships

- **`docker-compose.production.yml`** (graph neighbor) — Shares the same directory and the same "derive project name from directory" behavior if it lacks an explicit `name:`. The `name:` key here exists specifically to prevent container-name collisions with sibling Compose files in this repo.

## Notes

- **`-T` is mandatory** on the `podman-compose run` invocation. `podman-compose run` allocates a pty by default regardless of any `tty:` key in the file; under a pty, VitePress's spinner repaint path hangs through Podman's network stack (8 s build → 15 min+). `docker run` (used by CI directly) does not allocate a pty unless asked, so only this Compose-driven mode needs the flag.
- **`JEST_WORKERS` override** — Compose reads `.env` from the project root (unlike bare `docker run` env), so `${JEST_WORKERS:-8}` picks up a host `.env` value if present. The default of 8 was chosen after observing `global_oom` kills on dev boxes already running the main stack.
- **Not a CI job by design** — The hermetic proof (build image, run `npm run complete` with baked-in `mongod`, no services) is the stronger claim and what CI gates on. This file covers the everyday-dev shape where a database is supplied externally.
