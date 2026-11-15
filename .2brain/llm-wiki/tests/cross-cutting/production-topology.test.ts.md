---
source: tests/cross-cutting/production-topology.test.ts
sha256: 6e5f269dae5f2942d5ba96253af314fb3346d0550b41e0187fbbeb98f80f550d
generated_at: 2026-11-14T23:06:05.975820+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/production-topology.test.ts

## Purpose

A security-posture guard that re-reads `docker-compose.production.yml` and `docker/Dockerfile.production` on every push, asserting the specific hardening, isolation, and network-binding decisions those files encode. It exists because those properties are invisible to type-checkers, linters, and functional tests — they break a deployment silently in production, not in CI.

## Key elements

- **`parsedCompose` / `compose`** — The production compose file parsed with `{ merge: true }` so YAML merge keys (`x-hardening`, `x-app-env`) resolve into each service. Guarded by `isComposeFile` type-narrowing.
- **`dockerfile`** — Raw text of `docker/Dockerfile.production`; asserted against for absence (no package-manager invocation at startup).
- **`OWN_CODE_SERVICES`** — `['app', 'cron', 'setup']`; the three services sharing this repo's image and hardening block.
- **`BACKING_SERVICES`** — The eight data/monitoring services (database, cache, limits, queue, prometheus, alertmanager, loki, alloy) that must not publish a host port.
- **`hostInterfaceOf(port)`** — Extracts the bound host interface from either the short-string or long-mapping port spelling.
- **`describe` blocks** (one per property):
  - *container logs are bounded* — every service sets `max-size`/`max-file`.
  - *containers are hardened* — own-code services are `read_only`, `cap_drop: [ALL]`, `no-new-privileges`.
  - *data services are hardened* — backing stores drop all caps, re-add only the five the entrypoint needs.
  - *no data port published* — backing services have no `ports:`; any published port must bind `127.0.0.1`.
  - *bundled database TLS* — mongod command includes `--tlsCAFile` and optional client certs.
  - *cron config gate* — `cron` runs a config-check before `exec supercronic`.
  - *cron volumes ⊇ app volumes* — every mount on `app` appears on `cron` (derived, not re-listed).
  - *no package manager in image* — Dockerfile starts with `node`, not `npm`/`yarn`.

## Relationships

- **`tests/support/paths.ts`** — Supplies `REPO_ROOT`, the absolute path prefix used to locate both the compose file and the Dockerfile relative to the test runner's CWD. Without it the file reads could resolve to the wrong directory in monorepo or worktree setups.

## Notes

- `parse(..., { merge: true })` is **load-bearing**. Without it, YAML 1.1 merge keys (`<<: *hardening`) remain as a literal `<<` key, every service appears to lack hardening, and the entire file fails on a no-op refactor.
- The file is intentionally a set of narrow property assertions, not a full inventory of compose keys. Adding a "census" style assertion (e.g., exact match on the whole object) will break on the next legitimate edit and trains contributors to delete the test rather than update it.
- `BACKING_SERVICES` includes `loki` and `alloy` (the Grafana Alloy collector), which are monitoring-adjacent rather than application data stores but still must not expose a host port.
- The cron volume check is **derived** from `app`'s volume list rather than hard-coded, so adding a new mount to `app` automatically extends the assertion without editing this file.
