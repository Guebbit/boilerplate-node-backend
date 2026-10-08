---
source: docker/boot-check.sh
sha256: b9252c47e5ac643c3356f011a1d3928daa3e804781ad5b59fa53c5eabb9f8f4b
generated_at: 2026-10-07T23:47:26.303187+00:00
model: ollama:qwen3.8:27b
---

# docker/boot-check.sh

## Purpose

Integration smoke-test that boots the production image against a real MongoDB 8 instance and verifies two invariants a unit test cannot: the container starts fail-closed (config included) and answers `/livez`, and the runtime `node` user cannot write under `/app/src`. Run identically by the CI `boot` job and by developers so the proof cannot drift.

## Key elements

- **`cleanup()`** (trap `EXIT`) — force-removes the app and Mongo containers, the isolated Docker network, and the temp secrets directory, regardless of how the script exited.
- **Secrets generation loop** — creates seven random 48-byte base64 files (`token_access`, `token_refresh`, `totp`, `pii`, `webhook`, `pseudonym`, `metrics`) in a `mktemp -d` dir, mounted read-only at `/run/secrets`.
- **`docker network create`** — isolated network scoped by PID suffix to avoid collisions with concurrent runs.
- **Mongo container** — `mongo:8` pinned by SHA-256 digest; single dependency for the liveness check.
- **App container** — runs the target image with full production env (`NODE_ENV=production`, shop fields, VAT rates, all `NODE_*_FILE` pointers to the secrets dir). Binds port `3000` to `127.0.0.1:${BOOT_CHECK_PORT:-3999}` only.
- **Liveness poll** — up to 45 × 2 s = 90 s calling `curl /livez`; on failure dumps `docker logs` and exits 1.
- **Write check** — `docker exec … touch /app/src/.boot-check-write`; succeeds → the script fails the run.

## Relationships

No graph neighbors are recorded for this file. It is a standalone entry point invoked by CI (`ci.yml` → `boot` job) and ad-hoc by developers.

## Notes

- `--read-only` is **deliberately omitted** (unlike the production compose file). Adding it would make the write check pass trivially; the check is about *ownership*, not mount flags.
- Secrets are `chmod 755`/`644` on purpose: the container's `node` user runs as a different UID than the host runner, so "world-readable" does not leak to the wrong user. The files are ephemeral (deleted by `cleanup`).
- Queue and Redis/cache are **not** wired in. `/livez` never touches them, and they are expected to degrade gracefully—testing them here would conflate concerns.
- The script is strict-mode (`set -euo pipefail`) and requires exactly one positional argument (the image reference); it exits with a usage error otherwise.
- `$$` is used as the suffix for resource names; parallel invocations in the same shell would collide (unlikely in practice).
