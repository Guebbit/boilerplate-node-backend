---
source: docker/Dockerfile.production
sha256: 9144316e13d63d2ae61d2877226a23d047777ebfe5dcf70c5c8bec1a80168ed5
generated_at: 2026-11-08T02:18:09.974881+00:00
model: ollama:qwen3.8:27b
---

# docker/Dockerfile.production

## Purpose

Multi-stage Dockerfile that produces the production image for the API. Unlike the development Dockerfile (which bind-mounts the host tree), this image bakes the source code in, strips dev dependencies, runs as a non-root user, and refuses to build unless the code type-checks. It is the deployable artifact: `docker build -f docker/Dockerfile.production -t boilerplate-api:latest .`

## Key elements

- **Stage 1 (`build`)** — Installs full `node_modules` (incl. dev deps) with `npm ci --ignore-scripts`, copies the source, runs `postinstall` + `ts-check` as a build gate, then deletes test directories and `factories.ts` files. No lint (needs `.git`) and no test suite (needs live services) are run here.
- **Stage 2 (`runtime`)** — Re-installs production-only deps (`npm ci --omit=dev --ignore-scripts`), removes npm/npx/corepack/yarn to shrink CVE surface, copies `src/`, `api/`, `shared/`, selected `scripts/`, and `public/` from the build stage. Installs `dumb-init` (PID 1 signal handling) and, optionally, `chromium` + libs for invoice PDF rendering.
- **`INSTALL_CHROMIUM` build-arg** (default `false`) — Gates the ~200 MB Chromium install. Without it, `GET /orders/{id}/invoice` returns 500 and the order-confirmation email silently omits the attachment.
- **`supercronic`** — Installed via `docker/install-supercronic.mjs`; used by the `cron` service in the compose file against the same image.
- **Runtime entrypoint** — `node --import tsx src/cluster.ts` (same command as `npm start`); tsx transpiles once at boot with esbuild. No `tsc` emit.
- **Non-root `node` user** — Application files stay root-owned (readable, not writable by the runtime user); only `public/images`, `tmp/storage`, `tmp/quarantine` are chowned to `node`.
- **`NODE_ENV=production`** — Set so Express, error handlers, and cache-TTL logic switch to production mode.
- **Pinned base image** — `node:24.22.1-alpine@sha256:…` in both stages.

## Relationships

- **`docker-compose.production.yml`** — The compose file that consumes this image. It mounts volumes over `public/images`, `tmp/storage`, and `tmp/quarantine` (the three writable directories created in the image). It also runs the `cron` and `setup` services from the same image, relying on `supercronic` being present. Build and run commands documented in the Dockerfile header reference this file directly.

## Notes

- **Alpine, not Debian.** The dev image needs glibc for `mongodb-memory-server`'s `mongod`; this image never runs a test, so the constraint doesn't apply. The divergence is intentional.
- **TypeScript ships, not compiled JS.** `verbatimModuleSyntax`, extensionless relative imports (~300 files), and `paths` aliases make a `tsc` emit a multi-step refactor, not a flag flip. The cost is tsx in the runtime tree and ~1–2 s of boot transpilation.
- **`--ignore-scripts` in both stages.** In the build stage, `postinstall` can't run yet (source not copied). In the runtime stage, it prevents arbitrary postinstall hooks from executing at build time; nothing in the production tree needs one.
- **Lint is deliberately absent.** The `local/comment-links` rule shells out to `git ls-files`, but `.dockerignore` excludes `.git`. Lint runs in CI and pre-commit; this gate only catches type errors.
- **`scripts/` is copied selectively.** `run-script.ts` and `cli.ts` are imported as siblings by every deploy script; `scripts/db/` is named file-by-file; `scripts/ops/` is copied whole. Other `scripts/` subdirectories (developer tools) are excluded.
- **`dumb-init` as PID 1** is essential for graceful shutdown: `src/cluster.ts` drains in-flight requests on SIGTERM, which a bare `node` PID 1 would not receive (Docker would escalate to SIGKILL after the stop timeout).
