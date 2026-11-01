---
source: docker/boot-check.sh
sha256: 88fe571b4e5913b9f531e184235b0892ebd55246836c5c8cb63e11176bdc9935
generated_at: 2026-10-14T06:49:31.294801+00:00
model: ollama:qwen3.8:27b
---

# docker/boot-check.sh

## Purpose

Integration smoke-test that boots a production Docker image against a real MongoDB container and proves two things unit tests cannot: the image starts with fail-closed config and answers `/livez`, and the runtime `node` user cannot write under `/app/src/`. Used by both CI (`boot` job) and local development so the proof cannot drift between environments.

## Key elements

- **`cleanup()`** (trapped on `EXIT`) — removes the app container, Mongo container, the dedicated Docker network, and the temp secrets directory.
- **Secret generation loop** — creates one random 48-byte base64 file per `NODE_*_FILE` variable the app expects (`token_access`, `token_refresh`, `totp`, `pii`, `webhook`, `pseudonym`, `metrics`).
- **MongoDB container** — `docker.io/library/mongo:8` pinned to a specific `sha256` digest, on an isolated network.
- **App container** — the image under test, started with `NODE_ENV=production`, full shop/secret env vars, and a read-only bind-mount of the secrets dir to `/run/secrets`.
- **Liveness poll** — up to 45 × 2 s (≈ 90 s) retrying `curl /livez`; dumps `docker logs` on failure.
- **Write-ownership check** — `docker exec … touch /app/src/.boot-check-write`; exits 1 if the `node` user succeeds.

## Relationships

No graph neighbors. This is a standalone script; it does not import or source other repo files and is not imported by any.

## Notes

- Deliberately **no `--read-only`** on the app container (production compose uses it). Adding it would make the write check pass trivially; the check is about file *ownership*, not mount flags.
- Secrets are `chmod 644` on purpose: the container's `node` user has a different UID than the host runner, and the files are throwaway.
- Queue (BullMQ) and Redis/cache are **intentionally absent** — they degrade gracefully and `/livez` never touches them.
- Resource names are suffixed with `$$` so parallel invocations don't collide.
- Port is `127.0.0.1:3999` by default; override with `BOOT_CHECK_PORT`.
- The script exits non-zero on *either* check failure, making it directly usable as a CI gate.
