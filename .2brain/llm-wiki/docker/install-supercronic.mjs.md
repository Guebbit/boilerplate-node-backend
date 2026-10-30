---
source: docker/install-supercronic.mjs
sha256: 738fd8cf2e7d9f0aec507394f033df38e9e77b7706db82a58c05ef4a8f5c4e16
generated_at: 2026-10-29T01:18:21.944174+00:00
model: ollama:qwen3.8:27b
---

# docker/install-supercronic.mjs

## Purpose

Downloads the **supercronic** static binary, verifies it against a pinned SHA-256 digest, and installs it at `/usr/local/bin/supercronic` during Docker image builds. It is written in Node (rather than a shell script) because Node is the single tool guaranteed present in both the Alpine and Debian-slim base images. Supercronic replaces busybox `crond` because `crond` requires `CAP_SETGID` to reset supplementary groups per job, which breaks under the unprivileged `node` user.

## Key elements

- **`VERSION`** (`v0.2.51`) – the supercronic release to install; must be bumped together with the digests.
- **`SHA256`** – maps `process.arch` → `{ asset, digest }`. Currently pins `x64` (asset `amd64`) and `arm64`. An unrecognised architecture throws immediately.
- **`TARGET`** (`/usr/local/bin/supercronic`) – the install path; already on `PATH` in both images.
- **Top-level flow** (no exported functions) – resolves the arch, `fetch`es the release tarball, computes SHA-256 via `node:crypto`, compares against the pinned digest, writes the bytes, then `chmod 0o755`.

## Relationships

- Consumed by `docker/Dockerfile` and `docker/Dockerfile.production` (referenced in the file header) as a build-time install step for the `cron` service image. No other files in the dependency graph reference this module.

## Notes

- **Root required.** The script writes to `/usr/local/bin`, so it must run as a privileged user (i.e. before any `USER node` in the Dockerfile).
- **Top-level `await` / ESM.** The file uses `.mjs` extension and top-level `await`; it is executed directly (e.g. `node install-supercronic.mjs`), not imported.
- **Checksum is a hard gate.** A mismatch or a missing arch entry aborts the build with a descriptive error—there is no fallback or "trust on first use."
- **Bump discipline.** When upgrading supercronic, update `VERSION` *and* both `digest` values in the same change; the asset name (`amd64` / `arm64`) must also stay in sync with the upstream release naming.
- **No network retry.** A single `fetch` failure (DNS, HTTP ≥ 400) is fatal; there is no retry logic.
