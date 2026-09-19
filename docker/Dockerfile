# Base image layer. This defines the OS and preinstalled node (+ npm).
#
# Debian slim (glibc), not Alpine: `mongodb-memory-server` downloads a glibc-linked `mongod`, which
# cannot load on musl. `docker/Dockerfile.production` stays on Alpine — it never runs a test and
# never needs `mongod`, so the smaller runtime image is worth keeping there. Trixie over bookworm:
# `mongodb-memory-server-core`'s `getDebianVersionString()` maps any release >= 12 to the same
# `debian12` binary, so both resolve — took trixie since it's newer and it resolves.
#
# Node 24, not 25 (unlike `docker/Dockerfile.production`, still on `node:25-alpine`): `node --
# version` here has to satisfy every devDependency this image actually runs, and
# `dependency-cruiser` (`npm run check:dependencies`, part of `npm run complete`) hard-exits on
# Node 25 — its `engines` field is `^22||^24||>=26`, deliberately skipping Current/non-LTS lines.
# 24 is Active LTS. Worth a look: this repo's CI runs Node 22 (`NODE_VERSION` in
# `.github/workflows/ci.yml`) and `docker/Dockerfile.production` runs Node 25 — three different
# majors across CI/dev-image/prod-image, predating this change and wider than this change's scope
# to reconcile.
FROM docker.io/library/node:24-trixie-slim

# Sets the working directory inside the image to /app in the container
WORKDIR /app

# Install Chromium + deps (Debian).
# This is needed ONLY for puppetteer, it's not needed for the app itself. May be removed in the future
# `--no-install-recommends` keeps the layer to what Chromium actually launches with; apt pulls in
# its own runtime deps (nss, freetype, harfbuzz, ...) automatically. `fonts-freefont-ttf` is
# Debian's name for Alpine's `ttf-freefont`, so rendered PDFs keep the same fallback font.
# `libcurl4` is not for Chromium — it's what the baked-in `mongod` needs to even start (MongoDB
# links against it for its HTTP client) and Debian slim does not ship it by default.
#
# `git` is not for the app either — `npm run complete` (which this image runs hermetically)
# includes `lint`, and the `local/comment-links` ESLint rule shells out to `git ls-files`.
# `docker/Dockerfile.dockerignore` is what keeps `.git` itself in the build
# context for it to query — the root `.dockerignore` excludes it, for every other image.
#
# `busybox` is for the compose `cron` service, which runs `busybox crond` against this image.
# Alpine ships it in the base image; Debian slim does not.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-freefont-ttf \
    libcurl4 \
    git \
    busybox \
    && rm -rf /var/lib/apt/lists/*

# Where puppeteer-core looks for the browser. `src/infrastructure/adapters/pdf.ts`'s own fallback
# (absent this var) is Alpine's binary name and path, which does not exist on Debian — so this
# image MUST set it rather than lean on that fallback.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy the whole build context, not just package*.json: `npm ci`'s postinstall runs
# contracts:bundle + gen:api + gen:asyncapi (scripts/, shared/contracts/, orval.config.ts,
# asyncapi.yaml, ...), which npm ci needs on disk before it can run them. This is still a
# dev-only image — the bind mount in docker-compose.yml (`.:/app:Z`) overlays this copy with
# the live host tree at runtime, so `npm ci`'s only lasting effect is populating the
# `/app/node_modules` anonymous volume.
COPY . .

# Command to be executed inside the image at BUILD time.
#   In production we need it instead of "npm install" because it's cleaner (remove node_modules before installing) and more deterministic
#   (doesn't edit package-lock.json or modify the node_modules under some circumstances).
#   --omit=dev removes the devDependancies because you don't care about them in production.
#   You can use npm install in development because you want devDependencies and you don't mind about possible non-determinism.
#   add --omit=dev to omit dev dependencies in production
RUN npm ci

# Bakes a `mongod` into the image at build time, so the test suite (mongodb-memory-server) needs no
# network to run. `MONGOMS_DOWNLOAD_DIR` is the library's own binary cache directory — set here it
# persists into the running container, so `locateBinary()` finds this build's download at test time
# and never re-downloads. `mongodb-memory-server`: downloads and unpacks the `mongod` matching this
# platform/version, once. https://typegoose.github.io/mongodb-memory-server/docs/guides/configuring-mms
#
# This also removes a whole class of hang: `mongodb-memory-server`'s own lock around
# `~/.cache/mongodb-binaries` is shared machine-wide and has no timeout — if a stale lock's pid was
# reused by anything else, the wait never ends. That code path never runs once the binary is
# already on disk.
ENV MONGOMS_DOWNLOAD_DIR=/opt/mongodb-binaries
RUN node -e "require('mongodb-memory-server').MongoMemoryServer.create().then((server) => server.stop())"

# It declares that container listens to port 3000. In the docker-compose you expose the port 3000 so it's reachable from the host
EXPOSE 3000

# Images default commads to be executed at RUNTIME. Must be in JSON array format.
# CMD ["npm", "start"]
