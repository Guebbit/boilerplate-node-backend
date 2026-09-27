---
source: docker/install-supercronic.mjs
sha256: 289ff6345adc4b7e1fd7357d204d3dd58389b0ed5b26a5562cb6d0b1463a4f02
generated_at: 2026-09-27T13:47:29.645813+00:00
model: ollama:qwen3.8:27b
---

# docker/install-supercronic.mjs

## Purpose

Downloads the [supercronic](https://github.com/aptible/supercronic) scheduler binary from its GitHub release, verifies the SHA-256 checksum, and installs it to `/usr/local/bin/supercronic` at Docker image build time. Supercronic replaces busybox `crond` because crond resets supplementary groups before each job run (requiring `CAP_SETGID`), which causes every job to fail under the unprivileged `node` user. Node is used instead of a shell script because it is the one HTTP-capable tool present in both Alpine (has `wget`) and Debian slim (has neither `wget` nor `curl`).

## Key elements

- **`VERSION`** — Pinned supercronic release (`v0.2.49`); changing this requires updating the digests below.
- **`SHA256`** — Maps `process.arch` (`x64` → `amd64`, `arm64` → `arm64`) to the expected GitHub asset name and its SHA-256 hex digest.
- **`TARGET`** — Install path: `/usr/local/bin/supercronic`.
- **Top-level `await` block** — Fetches the binary, computes its SHA-256 via `node:crypto`, compares against the pinned digest (build fails on mismatch), writes the file, and `chmod 0o755`s it. Throws on unsupported architecture, non-2xx HTTP response, or checksum mismatch.

## Relationships

- Consumed by `docker/Dockerfile` and `docker/Dockerfile.production` at build time (per the file's own doc comment). No other graph neighbors are recorded.

## Notes

- Uses **top-level `await`**, so it must run under ESM (`node --input-type=module` or `.mjs` extension) on Node ≥ 18.
- Only `x64` and `arm64` are supported; any other `process.arch` throws immediately.
- The download is **not cached** in this script—each build re-fetches the binary. Deduplication (if any) is the Dockerfile's concern.
- The script is intentionally side-effect-only: it has no exports and no CLI argument parsing.
