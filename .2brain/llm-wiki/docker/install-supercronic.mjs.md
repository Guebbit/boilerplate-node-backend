---
source: docker/install-supercronic.mjs
sha256: 738fd8cf2e7d9f0aec507394f033df38e9e77b7706db82a58c05ef4a8f5c4e16
generated_at: 2026-11-08T02:20:23.830765+00:00
model: ollama:qwen3.8:27b
---

# docker/install-supercronic.mjs

## Purpose

Build-time script that downloads the supercronic binary, verifies its SHA-256, and installs it to `/usr/local/bin/supercronic`. It exists because supercronic is the job scheduler the `cron` service uses, and it must be present before the container starts. It runs during image builds for both `docker/Dockerfile` and `docker/Dockerfile.production`.

## Key elements

- **`VERSION`** (`'v0.2.51'`) — the supercronic release to install; must be bumped alongside the digests.
- **`SHA256`** — object keyed by `process.arch` (`x64` → `amd64`, `arm64` → `arm64`) holding the GitHub asset name and its expected SHA-256 hex digest.
- **`TARGET`** — `/usr/local/bin/supercronic`, the install path (on `PATH` in both base images).
- **Top-level flow** (no exported functions): resolves the pinned entry for the current arch → `fetch`es the GitHub release URL → verifies SHA-256 → `writeFile` + `chmod 0o755`.
- **Guard clause**: throws immediately if `process.arch` has no pinned entry (e.g. `ia32`, `armv7l`).

## Relationships

No graph neighbors are recorded for this file. It is invoked by the Dockerfiles (not via an import/require edge) as a `RUN node docker/install-supercronic.mjs` step during image build.

## Notes

- Written in Node (not shell) specifically because Alpine ships `wget` but Debian-slim ships neither `wget` nor `curl`; Node is the one runtime guaranteed in both base images.
- Supercronic was chosen over busybox `crond` because `crond` resets supplementary groups before each job (requiring `CAP_SETGID`), which fails when running as the unprivileged `node` user. Supercronic runs jobs as its own user.
- The script uses top-level `await` — it must be run as an ES module (`.mjs` extension / `"type": "module"`), not in CommonJS context.
- `fetch` follows redirects transparently, which is required because GitHub release URLs redirect to the CDN.
- The binary is **not** verified against a signature; integrity relies solely on the pinned SHA-256 and HTTPS.
- Bumping the version requires updating **both** `VERSION` and the corresponding `digest` value(s) in `SHA256`.
