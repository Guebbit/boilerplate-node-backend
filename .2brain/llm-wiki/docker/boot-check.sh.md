---
source: docker/boot-check.sh
sha256: 6786a13a3eb18b656f18cc44d1f59dc64f73ff3e0c3e02c7cf8b79a37f5d7561
generated_at: 2026-11-14T17:10:53.576350+00:00
model: ollama:qwen3.8:27b
---

# docker/boot-check.sh

## Purpose
Boots a production Docker image against a real (pinned) MongoDB container and proves two things unit tests cannot: the image starts fail-closed and `/livez` answers, and the runtime `node` user cannot write under `/app/src/`. Run identically by the CI `boot` job and by developers to keep the proof from drifting.

## Key elements
- **`cleanup()`** — removes the app/mongo containers, the ephemeral network, and the temp secrets directory. Registered via `trap … EXIT` so it fires on any exit path.
- **Secrets generation loop** — creates 48-byte random base64 files for each `NODE_*_FILE` variable the app reads (`token_access`, `token_refresh`, `totp`, `pii`, `webhook`, `pseudonym`, `metrics`) under a `mktemp -d` directory, mounted read-only at `/run/secrets`.
- **Mongo image extraction** — `sed` pulls the first pinned `mongo:<tag>@sha256:…` line from `../docker-compose.production.yml` so the check uses the exact same image as production compose.
- **`/livez` poll** — up to 45 × 2 s (90 s total) `curl` retries; dumps container logs and exits 1 on failure.
- **Write-permission check** — `docker exec … touch /app/src/.boot-check-write`; fails the run if the runtime user can create the file.

## Relationships
No graph neighbors.

## Notes
- `--read-only` is **deliberately omitted** on the app container (unlike production compose). Using it would make the write check trivially pass; the check is about code ownership, not mount flags.
- Secret files are `chmod 644` on purpose: the container's `node` user has a different UID than the host runner, so "world-readable" on the host is fine for throwaway data.
- Queue and cache services are intentionally absent — they degrade gracefully and `/livez` never touches them.
- Network/container names use `$$` (PID) as a suffix to allow concurrent runs.
- Port is `127.0.0.1:3999` by default; override with `BOOT_CHECK_PORT`.
- `set -euo pipefail` is set, but individual `docker rm`/`network rm` calls in `cleanup` are guarded with `|| true` so cleanup itself never masks the original exit code.
