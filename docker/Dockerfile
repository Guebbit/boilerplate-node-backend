# One Dockerfile, four targets: `dev`, `build` (internal), `docs`, `runtime`.
#
# `runtime` is LAST, so a bare `docker build -f docker/Dockerfile .` produces the image that ships.
# Every other target is named: `--target dev` or `--target docs`.
# Why each stage is shaped this way: docs/operate/ways-to-deploy/docker-server.md#why-the-image-is-shaped-this-way

# ────────────────────────────────────────────────────────────────────────────────────────────────
# dev: the development image and the one `npm run complete` runs in (CI `container-gate`).
# Debian (glibc), because the baked `mongod` cannot load on musl. Compose bind-mounts the tree over it.
# ────────────────────────────────────────────────────────────────────────────────────────────────
# `tag@sha256:digest`: the digest is what is pulled, the tag is a label that Dependabot moves with it.
# https://docs.docker.com/reference/dockerfile/#from
FROM docker.io/library/node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS dev

WORKDIR /app

# Chromium for puppeteer (invoice PDFs), `libcurl4` for the baked `mongod`, `git` for the
# `local/comment-links` lint rule (`git ls-files`). `--no-install-recommends` keeps the layer small.
# The `.git` itself is not in the build context: CI mounts it read-only when it runs the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-freefont-ttf \
    libcurl4 \
    git \
    && rm -rf /var/lib/apt/lists/*

# supercronic, for the compose `cron` service: the same scheduler, version and checksum as production.
COPY docker/install-supercronic.mjs /tmp/install-supercronic.mjs
RUN node /tmp/install-supercronic.mjs && rm /tmp/install-supercronic.mjs

# Where puppeteer-core looks for the browser. Its own fallback is Alpine's path, which Debian lacks.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Manifests first, so the install layer is reused whenever the lockfile did not move. The scripts wait:
# the root `postinstall` bundles and generates from `scripts/`, `shared/` and `src/modules/*/*.yaml`.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# The whole context. The compose bind mount overlays this copy at run time, so what lasts is the
# populated `/app/node_modules` volume. `.dockerignore` keeps node_modules, `.git`, `.env` and `tmp/` out.
COPY . .

# What `npm ci` would have run with scripts on: the dependencies' own install scripts (`npm rebuild`:
# esbuild, swc, the file watcher), then the root `postinstall`. Then the lockfile stamp, in the form
# `docker/ensure-deps.sh` checks, so a fresh `/app/node_modules` volume is not reinstalled by the compose
# services' own run of that script.
RUN npm rebuild && npm run postinstall \
    && sha256sum package-lock.json | cut -d ' ' -f 1 > node_modules/.package-lock.sha256

# Bakes a `mongod` in, so the suite (mongodb-memory-server) needs no network. `MONGOMS_DOWNLOAD_DIR` is
# the library's binary cache; set here it persists into the container, so no download at test time.
# https://typegoose.github.io/mongodb-memory-server/docs/guides/configuring-mms
ENV MONGOMS_DOWNLOAD_DIR=/opt/mongodb-binaries
RUN node -e "require('mongodb-memory-server').MongoMemoryServer.create().then((server) => server.stop())"

# Documentation only; compose publishes the port.
EXPOSE 3000

# ────────────────────────────────────────────────────────────────────────────────────────────────
# build: installs everything and is the type-check gate. Not a target on its own.
# Alpine: no test runs here, so no `mongod`, so no glibc.
# ────────────────────────────────────────────────────────────────────────────────────────────────
FROM docker.io/library/node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build

WORKDIR /app

# Manifests first, so this layer is reused whenever the lockfile did not move.
COPY package.json package-lock.json ./

# `npm ci`: exactly the lockfile, never rewrites it. Dev dependencies are the gate's tools.
# `--ignore-scripts`: postinstall needs `scripts/` and `shared/`, which are not copied yet.
RUN npm ci --ignore-scripts

# `.dockerignore` keeps node_modules, `.git`, `.env` and `tmp/` out.
COPY . .

# postinstall bundles the contracts and generates the typed client; `ts-check` then refuses the build
# on a type error. Not lint (needs `.git`) and not the tests (they need Mongo, Redis, RabbitMQ).
RUN npm run postinstall && npm run ts-check

# Test code and test builders are not part of what runs. Deleted after the gate type-checked them and
# before `runtime` copies `src/`. `-prune`: do not descend into a `tests/` it is about to remove.
RUN find src -type d -name tests -prune -exec rm -rf {} + \
    && find src -type f -name factories.ts -delete

# ────────────────────────────────────────────────────────────────────────────────────────────────
# docs-build: the VitePress site, built on top of `build`. Not a target on its own.
# ────────────────────────────────────────────────────────────────────────────────────────────────
FROM build AS docs-build

# `lastUpdated: true` in docs/.vitepress/config.ts runs `git log` per page, so this stage needs the
# git binary and the repository's history. Neither reaches the final `docs` image.
RUN apk add --no-cache git

# The history arrives as a NAMED build context, `gitdir`, because the build context itself leaves
# `.git` out (`.dockerignore`). It is mounted read-only for this one step and never copied into a layer:
#   docker build -f docker/Dockerfile --target docs --build-context gitdir=.git .
# (compose passes it as `additional_contexts`). `safe.directory`: the mount belongs to the host user,
# the step runs as root, and git >= 2.35.2 refuses that as "dubious ownership".
# https://docs.docker.com/build/concepts/context/#named-contexts
# https://docs.docker.com/reference/dockerfile/#run---mount
RUN --mount=type=bind,from=gitdir,target=/app/.git,readonly \
    git config --global --add safe.directory /app \
    && npm run docs:build

# ────────────────────────────────────────────────────────────────────────────────────────────────
# docs: the documentation site served by nginx (compose profile `docs`).
# ────────────────────────────────────────────────────────────────────────────────────────────────
FROM docker.io/library/nginx:1.31.8-alpine@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11 AS docs

RUN rm -rf /usr/share/nginx/html/*

COPY --from=docs-build /app/docs/.vitepress/dist /usr/share/nginx/html

# Cache headers and the fallback rules.
COPY docker/nginx.docs.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# ────────────────────────────────────────────────────────────────────────────────────────────────
# runtime: what ships. Production dependencies, the type-checked source, `node` as the user.
# Last stage on purpose: it is what a build without `--target` produces.
# ────────────────────────────────────────────────────────────────────────────────────────────────
FROM docker.io/library/node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runtime

# Chromium is off by default (~200 MB). Only invoice rendering needs it:
#   docker build -f docker/Dockerfile --target runtime --build-arg INSTALL_CHROMIUM=true .
# Without it the order-confirmation mail still sends, silently, with no invoice attached.
ARG INSTALL_CHROMIUM=false

WORKDIR /app

# `dumb-init` is PID 1 so SIGTERM reaches Node and `src/serve.ts` can shut down gracefully.
RUN apk add --no-cache dumb-init \
    && if [ "$INSTALL_CHROMIUM" = "true" ]; then \
    apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont; \
    fi

# supercronic, the scheduler the compose `cron` service runs against this same image.
COPY docker/install-supercronic.mjs /tmp/install-supercronic.mjs
RUN node /tmp/install-supercronic.mjs && rm /tmp/install-supercronic.mjs

# Where puppeteer-core looks for the browser (Alpine's binary name).
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# A deployment: no stack traces in errors, no development-only express work.
ENV NODE_ENV=production

COPY package.json package-lock.json ./

# `--omit=dev` (~200 MB instead of ~1.4 GB) and `--ignore-scripts` (no transitive install-time code).
# npm, npx, corepack and yarn go in the SAME layer, or a later RUN would leave them in the one below:
# nothing here starts through them (`node --import tsx`), and they are CVE surface.
RUN npm ci --omit=dev --ignore-scripts \
    && rm -rf /root/.npm /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-v*

# What something reads at run time, copied from `build` so what ships is what was type-checked.
# No `--chown`: the code is root-owned, so `node` can read it and cannot rewrite it.
#   src/      the application (with each module's own templates)
#   api/      generated types and zod schemas, imported as @api/*
#   shared/   the EJS layout partials and the contract fragments
#   scripts/  the entry wrapper and flag reader, the deploy-time `db` scripts (file by file), and
#             `ops/` whole (the cron jobs and `reencrypt`)
#   public/   express.static root
COPY --from=build /app/src ./src
COPY --from=build /app/api ./api
COPY --from=build /app/shared ./shared
COPY --from=build /app/scripts/run-script.ts /app/scripts/cli.ts ./scripts/
COPY --from=build /app/scripts/db/index-sync.ts \
    /app/scripts/db/sync-indexes.ts /app/scripts/db/cache-clear.ts \
    /app/scripts/db/bootstrap-access.ts ./scripts/db/
COPY --from=build /app/scripts/ops ./scripts/ops
COPY --from=build /app/public ./public
COPY --from=build /app/tsconfig.json ./

# Uploads, the invoice cache and the mail spool land here. Each must exist and belong to `node`
# BEFORE its volume is mounted over it (compose.production.yaml mounts one on each).
RUN mkdir -p public/images tmp/storage tmp/quarantine \
    && chown -R node:node public/images tmp/storage tmp/quarantine

# Drop root: the `node` user (uid 1000) ships with the base image. Everything above needs root.
USER node

# Documentation only; the app binds NODE_PORT.
EXPOSE 3000

# No HEALTHCHECK here on purpose: Podman builds OCI images by default and OCI drops it, so the one
# definition lives in `compose.production.yaml` (`app` and `cron`), which both engines read.
# Outside compose, give the platform the same probe: `GET /livez`. docs/operate/health-checks.md

ENTRYPOINT ["dumb-init", "--"]

# `npm start`, spelled out (no npm here). `--import tsx` loads tsx inside the one node process, from
# the working directory, so every command runs from /app. https://tsx.is/node#nodejs-import
# One process per container: scale with orchestrator replicas.
CMD ["node", "--import", "tsx", "src/main.ts"]
