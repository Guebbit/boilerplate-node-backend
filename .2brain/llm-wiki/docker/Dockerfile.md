---
source: docker/Dockerfile
generated_at: 2026-11-22T01:27:09.123301+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/Dockerfile

## Purpose
A single multi-stage Dockerfile that produces the development image, the production runtime image, and the documentation site image. `runtime` is deliberately the last stage, so a bare `docker build -f docker/Dockerfile .` yields the image that ships. All other targets are selected with `--target`.

## Key elements
- **`dev`** (Debian trixie-slim, glibc): used for development and by CI `container-gate` (`npm run complete`). Installs Chromium, `libcurl4`, `git` and supercronic. Runs `npm ci --ignore-scripts`, then `npm rebuild` and `postinstall`, then writes a lockfile sha256 stamp to `node_modules/.package-lock.sha256` (checked by `docker/ensure-deps.sh`). Bakes a `mongod` into `/opt/mongodb-binaries` (`MONGOMS_DOWNLOAD_DIR`) so tests need no network. Sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`. Exposes 3000.
- **`build`** (Alpine, internal): `npm ci`, `COPY . .`, then `npm run postinstall && npm run ts-check` as the type-check gate. Afterwards deletes `tests/` directories and `factories.ts` under `src/`.
- **`docs-build`** (internal, from `build`): installs `git` and runs `npm run docs:build` (VitePress, with `lastUpdated: true` set in `docs/.vitepress/config.ts`). Git history comes in through the named build context `gitdir`, mounted read-only with `RUN --mount=type=bind` and never copied into a layer.
- **`docs`**: nginx Alpine serving the built VitePress `dist` output, with config from `docker/nginx.docs.conf`. Exposes 80.
- **`runtime`** (Alpine, ships):
  - `ARG INSTALL_CHROMIUM` (default `false`) optionally adds Chromium for invoice PDFs.
  - `dumb-init` is the entrypoint (PID 1).
  - supercronic is installed via `docker/install-supercronic.mjs`.
  - `NODE_ENV=production`.
  - `npm ci --omit=dev --ignore-scripts`, then npm, npx, corepack and yarn are removed in the same layer.
  - Copies `src`, `api.generated`, `shared`, selected `scripts/` files, `scripts/ops`, `public` and `tsconfig.json` from `build`.
  - Creates `public/images`, `tmp/storage` and `tmp/quarantine`, owned by `node`.
  - Runs as `USER node`.
  - `CMD ["node", "--import", "tsx", "src/main.ts"]`.
- Base images are pinned as `tag@sha256:digest`.

## Relationships
- `k8s/base/app.yaml` is the Kubernetes deployment manifest that consumes the image built by the `runtime` stage. The Dockerfile does not define a `HEALTHCHECK`. Its comments say that outside compose the platform should be given the probe `GET /livez`.

## Notes
- `runtime` must stay the last stage, or a bare build would no longer produce the shipping image.
- `dev` uses glibc because the baked `mongod` can't run on musl. `build` and `runtime` use Alpine because they run no tests.
- `runtime` has no npm. Start the app with `node --import tsx`, not `npm start`. Run it from `/app`.
- The runtime code is root-owned (no `--chown`), so `node` can read it but not modify it. Only the upload, cache and spool directories are writable.
- The `docs` target needs `--build-context gitdir=.git`, because `.git` is excluded from the normal context.
- Without `INSTALL_CHROMIUM=true`, the invoice download endpoint (`GET /orders/{id}/invoice`) returns an error.
- `EXPOSE` is documentation only. The app binds `NODE_PORT`.
- Runs one process per container. Scale through orchestrator replicas.
