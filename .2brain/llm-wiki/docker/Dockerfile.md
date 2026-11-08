---
source: docker/Dockerfile
sha256: e09e00b2bb90edd5d59d8379e1293378130f1753f57b5425ac9e88bbe7c8261e
generated_at: 2026-11-08T02:17:56.969884+00:00
model: ollama:qwen3.8:27b
---

# docker/Dockerfile

## Purpose

Dev/test Docker image that builds a hermetic environment for running the full test suite (`npm run complete`) without external network access. It bakes in a `mongod` binary, Chromium for Puppeteer, and all build-time dependencies so that `docker-compose.test.yml` can execute tests in isolation.

## Key elements

- **Base image** — `node:24-trixie-slim` (Debian, pinned by SHA). Debian (glibc) is required because `mongodb-memory-server` downloads a glibc-linked `mongod` that cannot run on musl/Alpine. Node 24 (Active LTS) is chosen because `dependency-cruiser`'s `engines` field skips Node 25.
- **`apt-get install` block** — Installs `chromium` (Puppeteer), `libcurl4` (required by the baked-in `mongod`), `git` (ESLint `comment-links` rule shells out to `git ls-files`), `fonts-freefont-ttf`, `ca-certificates`.
- **`supercronic` install** — Runs `docker/install-supercronic.mjs` at build time so the compose `cron` service matches production's scheduler version/checksum.
- **`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`** — Required because `src/infrastructure/adapters/pdf.ts`'s fallback path targets an Alpine binary name that doesn't exist on Debian.
- **`COPY . .`** — Copies the entire build context (not just `package*.json`) because `npm ci`'s postinstall scripts (`contracts:bundle`, `gen:api`, `gen:asyncapi`) need source files on disk. At runtime the bind mount in `docker-compose.yml` overlays this.
- **`npm ci`** — Installs all dependencies (including devDependencies) deterministically at build time.
- **`MONGOMS_DOWNLOAD_DIR` + `MongoMemoryServer.create()`** — Bakes the `mongod` binary into the image at build time. This eliminates the `mongodb-memory-server` download (and its machine-wide lock, which has no timeout) at test time.
- **`EXPOSE 3000`** — Declares the app's listening port for compose port-mapping.
- **`CMD`** — Commented out; the entrypoint is defined by the consuming compose file.

## Relationships

- **`docker-compose.yml`** — Consumes this image as the dev service; bind-mounts the host working directory (`.:/app:Z`) over the baked-in `/app`, so the image's lasting contribution is the `/app/node_modules` volume plus the baked `mongod` and Chromium.
- **`docker-compose.test.yml`** — Consumes this image for the hermetic test run; relies on the baked `mongod` and pre-installed deps so `npm run complete` needs no network.

## Notes

- This image is **dev/test only**. Production uses a separate `Dockerfile.production` (Alpine-based, no `mongod`, no Chromium).
- The root `.dockerignore` excludes `.git`; `docker/Dockerfile.dockerignore` (a per-Dockerfile ignore file) re-includes it so the `comment-links` ESLint rule can query `git ls-files` during `npm run complete`.
- `fonts-freefont-ttf` is the Debian equivalent of Alpine's `ttf-freefont` and ensures PDF output renders with the same fallback font across environments.
- The `libcurl4` package is not for Chromium — it satisfies a link dependency of the MongoDB HTTP client inside `mongod`.
