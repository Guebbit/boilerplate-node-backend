---
source: docker-compose.test.yml
sha256: f83e5bfeff9228b0493c6f0e9dfd5f302deffde7b1d867509641c6199ee5a370
generated_at: 2026-09-27T13:47:03.834871+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.test.yml

## Purpose

Proves the "wired" half of the container story: that the app's env-var branches (`NODE_TEST_MONGO_URI`, `NODE_TEST_REDIS_URL`) work end-to-end against externally-provided Mongo and Redis, the same shape CI `services:` blocks supply. It complements the hermetic CI gate (build image, run with no services) which proves the image is self-contained. Intended as a manual pre-merge check, not a second CI job.

## Key elements

- **`name: boilerplate-node-backend-gate`** — Explicit compose project name. Without it, Compose derives the name from the working directory, colliding with `docker-compose.yml` and clobbering its containers. Do not remove.
- **`mongo` service** — `mongo:8` started as a single-member replica set (`rs0`). The healthcheck self-initiates `rs.initiate()` with the host pinned to `mongo:27017` (not `localhost`) so the `gate` container can reach it by service name. No named volume, no seed data — scratch space for one run.
- **`redis` service** — `redis:7-alpine` with a `redis-cli ping` healthcheck.
- **`gate` service** — Builds `docker/Dockerfile`, runs `npm run complete` with `NODE_TEST_MONGO_URI` and `NODE_TEST_REDIS_URL` pointing at the sibling services. `JEST_WORKERS` defaults to 8 to prevent OOM-kills from the host's memory-based worker sizing. `depends_on` both services with `condition: service_healthy`. No bind mounts; output is streamed to the terminal.

## Relationships

- **`docker-compose.production.yml`** — Sibling compose file in the same project. This file is deliberately scoped to a single `gate` run and has no dependency on, or dependency on, the production stack; they are independent deployments of the same image.

## Notes

- **`-T` is mandatory** in the `run` invocation. `podman-compose run` allocates a PTY regardless of any `tty:` key in the file, and the resulting spinner-repainting degraded an 8-second `docs:build` to 15+ minutes. `docker run` (used by CI) doesn't allocate one unless asked, which is why this only bites in compose-driven mode.
- **No bind mounts, by design.** A rootless-Podman UID fix (`--userns=keep-id`) conflicts with the image's root-owned `/app` — adding a bind mount makes the in-container process lose write access to `dist/`. The env-var branch is verified through live stdout instead.
- **`JEST_WORKERS` override** is read from the host `.env` (Compose interpolates it). On a dev box already running the main stack, the default memory-based sizing over-commits and the kernel OOM-kills a Jest worker mid-suite.
- **Not a CI gate.** The hermetic single-image proof in CI is the stronger, more portable claim. This file exercises the everyday-developer shape of external services and is a manual sanity check before merging.
