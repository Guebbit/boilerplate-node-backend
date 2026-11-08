---
source: docker/boot-check.sh
sha256: 3915b057edc4c2e6b13c852a2ef91f0ca90e00390396327eac682c91953937f5
generated_at: 2026-11-08T02:19:36.241843+00:00
model: ollama:qwen3.8:27b
---

# docker/boot-check.sh

## Purpose

Integration smoke test that boots the production image alongside a real MongoDB container and verifies two properties a unit test cannot: the image starts successfully (fail-closed config, `/livez` responds) and the runtime `node` user cannot write to `/app/src/`. Run by both CI (`boot` job) and developers so the proof cannot drift between environments.

## Key elements

- **`cleanup()`** (trapped on `EXIT`) — removes both containers, the Docker network, and the temp secrets directory regardless of where the script fails.
- **Secret generation loop** — writes 48 random bytes (base64) into one file per `NODE_*_FILE` env var (`token_access`, `token_refresh`, `totp`, `pii`, `webhook`, `pseudonym`, `metrics`) under a `mktemp -d` directory, mounted read-only at `/run/secrets`.
- **`mongo_image` extraction** — `sed`-parses the first pinned `mongo:` image line from `../docker-compose.production.yml` so the check uses the exact production image.
- **App container launch** — runs the target image with production env vars, `NODE_ENABLE_CLUSTERING=0`, a local-only port bind, and the secrets mount. Deliberately omits `--read-only` so the write check tests ownership, not the mount flag.
- **`/livez` polling loop** — 45 × 2 s (up to 90 s) `curl` retries; dumps `docker logs` and exits 1 on failure.
- **Write-permission assertion** — `docker exec … touch /app/src/.boot-check-write`; fails if the `node` user can create a file, proving the code tree is root-owned.

## Relationships

- **`docker-compose.production.yml`** (sibling in `../`) — the script extracts the pinned Mongo image reference from this file at runtime, so a changed digest in compose is what the check validates.

## Notes

- Queue and cache backends are intentionally absent: they degrade gracefully and `/livez` never exercises them.
- Secret files are `chmod 644` / directory `755` on purpose — the container's `node` user has a different UID from the host runner, so "world-readable" is safe for throwaway values.
- The `--read-only` flag is **not** passed to the app container (unlike production compose); adding it would make the write check trivially pass and defeat its purpose.
- `BOOT_CHECK_PORT` env var (default `3999`) lets a developer override the port if 3999 is taken.
- Suffixes (`$$`) on container/network names prevent collisions when two instances run concurrently.
