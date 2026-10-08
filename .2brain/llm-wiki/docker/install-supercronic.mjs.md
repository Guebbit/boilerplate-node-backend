---
source: docker/install-supercronic.mjs
sha256: 853f299d192981e3ef08c06b863bb1ec67d8cf8b4ded0b7b656abbae0446771c
generated_at: 2026-10-07T23:47:35.868824+00:00
model: ollama:qwen3.8:27b
---

# docker/install-supercronic.mjs

## Purpose
Downloads, verifies, and installs the [supercronic](https://github.com/aptible/supercronic) cron scheduler binary into `/usr/local/bin` during Docker image builds. It exists because busybox `crond` resets supplementary groups before each job (requiring `CAP_SETGID`), which breaks under the unprivileged `node` user; supercronic runs jobs as-is. Written in Node (rather than shell) because Node is the one download tool guaranteed on both Alpine and Debian slim base images.

## Key elements
- **`VERSION`** – Pinned supercronic release tag (`v0.2.49`). Must be bumped together with the digest table.
- **`SHA256`** – Map of `process.arch` → `{ asset, digest }` for the two supported architectures (`x64`/`amd64`, `arm64`/`arm64`). An unsupported arch throws at import time.
- **`TARGET`** – Install path: `/usr/local/bin/supercronic`.
- **Top-level logic (no exported functions)** – Sequential steps: resolve URL → `fetch` the release asset → SHA-256 verify against the pinned digest → `writeFile` → `chmod 0o755`. Any failure throws and aborts the build.

## Relationships
No in-repo graph neighbors. The file is invoked by `docker/Dockerfile` and `docker/Dockerfile.production` at build time (via a `RUN node docker/install-supercronic.mjs` step) and is otherwise standalone.

## Notes
- **Top-level `await`** – The file relies on ESM top-level await (`import` + `await fetch`), so it must be run as an ES module (`.mjs` extension / `"type": "module"` context).
- **No `package.json` dependency** – Uses only Node built-ins (`node:crypto`, `node:fs/promises`, global `fetch`/`Buffer`). No `npm install` needed before running.
- **Checksum is the security gate** – A mismatched SHA-256 fails the build; the digest is the *only* integrity check (no TLS-pinning or GPG signature step).
- **Architecture coverage** – Only `x64` and `arm64` are pinned; any other `process.arch` (e.g., `ia32`, `riscv64`) throws immediately with a descriptive message.
- **Idempotency** – Re-running simply overwrites the binary and re-sets permissions; no "already installed" short-circuit.
