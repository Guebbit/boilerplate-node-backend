---
source: docker/install-supercronic.mjs
source_sha256: d370d19def5431450a2d7890534b58b0943ee6540732e8016016e102506949b6
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:30:14.049482+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/install-supercronic.mjs

## Purpose
A build-time Node script that downloads the supercronic scheduler binary, verifies its SHA-256 checksum, and installs it at `/usr/local/bin/supercronic`. It runs during the `dev` and `runtime` stages of `docker/Dockerfile`, and supercronic is the scheduler the `cron` service runs. supercronic replaces busybox `crond` because crond resets supplementary groups before each job, which needs CAP_SETGID, so every job failed when running as the unprivileged `node` user. supercronic runs jobs as whichever user it runs as.

## Key elements
- `VERSION`: the pinned supercronic release (`v0.2.51`). It must be bumped together with the digests.
- `SHA256`: a map keyed by Node's `process.arch` (`x64`, `arm64`). Each entry gives the release asset suffix (`amd64` or `arm64`) and the expected SHA-256 digest.
- `TARGET`: the install path, `/usr/local/bin/supercronic`.
- Top-level script flow:
  1. Look up the pinned entry for `process.arch`. It throws if the architecture is unpinned.
  2. Build the GitHub release URL (`supercronic-linux-<asset>`) and download it with the built-in `fetch`. It throws on a non-OK HTTP status.
  3. Hash the bytes with `node:crypto` and throw on a checksum mismatch.
  4. Write the file, `chmod` it to `0o755`, and log a confirmation line.

## Relationships
No graph neighbors. By its header comment, it is invoked from `docker/Dockerfile` (the `dev` and `runtime` stages), but that file is not part of the dependency graph.

## Notes
- It is written in Node rather than shell because Node is the one tool both base images already carry. Alpine has wget, while Debian slim has neither wget nor curl.
- Any failure (unsupported architecture, HTTP error, checksum mismatch) throws, which fails the image build. Nothing is written before the checksum passes.
- `fetch` follows redirects, which GitHub release downloads use.
- Upgrading means changing `VERSION` and both digests. The digests are the GitHub release asset digests.
- It uses top-level `await`, so it must run as an ES module (`.mjs`).
