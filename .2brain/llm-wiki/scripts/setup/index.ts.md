---
source: scripts/setup/index.ts
source_sha256: 6a63002ff8977d531c1e1a31a4d59426dec2ff38d0ca8297183c80ffd333bf7e
context_sha256: 5278caf83378d5c130e5ac6f8f7dd4695d561d9a3e393929a9f3c9aefc84f6b2
generated_at: 2026-11-22T02:18:11.027663+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/setup/index.ts

## Purpose
The `npm run setup` entry script (run via `tsx`). It takes a fresh clone to a usable `.env` in one command: it creates `.env` from `.env-example` if missing, fills every still-placeholder secret with a random value, and writes a copy of the metrics token to a file for Prometheus. It prints only key names, never secret values.

## Key elements
This is a top-level script with no exports. It runs on import and does the following:
- `ENV_EXAMPLE`, `ENV_FILE`, `METRICS_TOKEN_FILE`: paths under the repo root. The token file is `tmp/secrets/prometheus-metrics-token`.
- `ensureEnvironmentFile()`: copies `.env-example` to `.env` only if `.env` is absent. It uses `COPYFILE_EXCL`, so a `.env` that appears between the check and the copy is never overwritten. Returns whether it created the file.
- `writeSecretFile(target, content)`: creates parent directories and writes to a temp file (`<target>.tmp-<pid>`) with mode `0600`. It then renames the temp file over the target, so the write is atomic.
- Main flow:
  1. Ensure `.env` exists and log if it was created.
  2. Read `.env` and call `fillPlaceholders(before, fillableKeys())`, which returns the new content and the list of filled keys.
  3. Write `.env` and log the filled key names only if something was filled. Otherwise log "nothing to fill".
  4. Always write the `NODE_METRICS_TOKEN` value (or an empty string if absent) to the Prometheus token file.

## Relationships
- `./environment-file`: provides `fillPlaceholders` (the placeholder replacement) and `readEnvironmentValue` (reads `NODE_METRICS_TOKEN` from the updated content).
- `./required-keys`: provides `fillableKeys()`, the list of secrets to fill. Per the header comment, it is derived from the enabled modules and the app-level boot-gate checks, so new modules' secrets are covered automatically.
- `../modules-on-disk`: provides `REPO_ROOT`, imported as `ROOT` and used to build all paths.

## Notes
- Re-running is safe. An existing `.env` is never overwritten, and `.env` is rewritten only when a placeholder was actually filled.
- The token file is written on every run, even when nothing was filled. The header explains why: Prometheus reads its scrape credential from a file, and if the file is absent, Docker/Podman creates a directory at the bind-mount path, so Prometheus then fails to read it.
- If `NODE_METRICS_TOKEN` is missing from `.env`, the token file is written empty.
- Generated values are described as `randomBytes(32)` in the header. That call happens elsewhere (presumably in `environment-file`), not in this file.
