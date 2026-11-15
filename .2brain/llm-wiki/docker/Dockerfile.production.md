---
source: docker/Dockerfile.production
sha256: 4daad6556ba3f05b5f61e78c390b781a7c241688f5ac7f5d4821300a0077c0d5
generated_at: 2026-11-14T17:10:34.539369+00:00
model: ollama:qwen3.8:27b
---

# docker/Dockerfile.production

## Purpose

Multi-stage Dockerfile that produces the production image for the API. Unlike the development `docker/Dockerfile` (which bind-mounts the working tree), this image bakes the source in, strips dev dependencies, enforces a type-check gate before an image can exist, and runs as a non-root `node` user. It targets Alpine to keep the runtime footprint small (no `mongod` dependency here).

## Key elements

- **Stage 1 – `build`**: Installs full `node_modules` via `npm ci --ignore-scripts`, copies source, runs `npm run postinstall && npm run ts-check` as a hard gate (build fails on any type error), then deletes `src/**/tests/` directories and `factories.ts` files before the runtime stage copies anything.
- **Stage 2 – `runtime`**: Reinstalls only production deps (`--omit=dev --ignore-scripts`), removes npm/corepack/yarn binaries in the same `RUN` layer, installs `dumb-init` (PID 1 for signal delivery) and optionally Chromium (via `--build-arg INSTALL_CHROMIUM=true`), installs `supercronic` (for the `cron` and `setup` compose services that share this image), and copies a curated set of source paths (`src/`, `api/`, `shared/`, `scripts/run-script.ts`, `scripts/cli.ts`, `scripts/db/`, `scripts/ops/`, `public/`, `tsconfig.json`).
- **`INSTALL_CHROMIUM` build-arg**: Off by default. Only `infrastructure/adapters/pdf.ts` (invoice rendering via puppeteer-core) needs it. Without it, `GET /orders/{id}/invoice` returns 500 and order-confirmation emails send without an attachment.
- **Writable directories**: `public/images`, `tmp/storage`, `tmp/quarantine` are created and `chown`-ed to `node:node` before volume mounts.
- **Base image**: `node:24.22.1-alpine@sha256:…` pinned by digest in both stages.
- **Runtime entry**: `node --import tsx src/main.ts` (same as `npm start`); `tsx` transpiles with esbuild at boot.

## Relationships

- **`docker-compose.production.yml`**: This Dockerfile is the image that compose builds/starts. The compose file mounts volumes at the three writable paths (`public/images`, `tmp/storage`, `tmp/quarantine`) created here; runs the `app`, `cron` (via supercronic), and `setup` services all from this single image.

## Notes

- **Alpine vs. Debian divergence is intentional**: the dev Dockerfile needs glibc for `mongodb-memory-server`'s `mongod`; this image never starts `mongod`, so Alpine's smaller footprint is kept.
- **Ships TypeScript, not compiled JS**: switching to a `tsc` emit requires simultaneously fixing `verbatimModuleSyntax`, adding `.js` extensions to ~300 extensionless imports, and resolving `paths` aliases (`@infrastructure/*`, `@kernel/*`, etc.) that `tsc` does not rewrite. Until all three are done, `tsx` at boot is the deployment path.
- **No lint in the build stage**: the `local/comment-links` rule shells out to `git ls-files`, but `.dockerignore` excludes `.git`. Lint already runs in pre-commit and CI.
- **No tests in the build stage**: they require MongoDB, Redis, and RabbitMQ; tests belong to CI.
- **`--ignore-scripts` on the runtime `npm ci`**: no transitive package needs a `postinstall` hook at runtime (password hashing uses `node:crypto`).
- **`.dockerignore`** keeps `node_modules`, `.git`, `.env`, and `tmp/` out of the build context; source is copied in stage 1, not from the host at runtime.
