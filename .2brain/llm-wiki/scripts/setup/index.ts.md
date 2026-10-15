---
source: scripts/setup/index.ts
sha256: 81a3910d8508017764170be55c751711c3719ec0f90589346985267d55706251
generated_at: 2026-10-15T09:48:01.828233+00:00
model: ollama:qwen3.8:27b
---

# scripts/setup/index.ts

## Purpose

Entry point for `npm run setup`. Bootstraps a fresh clone into a working local environment in one shot: creates `.env` from the committed template (if absent), replaces every still-placeholder secret with a fresh random value, and writes the Prometheus scrape-credential file so the local observability stack can start.

## Key elements

- **`ensureEnvironmentFile()`** — Copies `.env-example` → `.env` using `fsConstants.COPYFILE_EXCL` so it never overwrites an existing file (race-safe). Returns `true` only on creation.
- **`writeSecretFile(target, content)`** — Atomic secrets write: creates a PID-suffixed temp file with `0o600` mode, then `renameSync` into place. Creates parent directories recursively.
- **Top-level run** (not wrapped in a function) — Orchestrates the three steps: ensure `.env`, call `fillPlaceholders` with `fillableKeys()`, write back only if something changed, then always mirror `NODE_METRICS_TOKEN` into `tmp/secrets/prometheus-metrics-token`.
- **`ENV_EXAMPLE`, `ENV_FILE`, `METRICS_TOKEN_FILE`** — Module-level path constants derived from `REPO_ROOT`.

## Relationships

- **`scripts/setup/environment-file.ts`** — Provides `fillPlaceholders` (replaces placeholder values in the env text) and `readEnvironmentValue` (extracts a single key's value after filling).
- **`scripts/setup/required-keys.ts`** — Provides `fillableKeys()`, the dynamic list of secret keys that must be set before the boot gate passes. This makes the setup script automatically cover new modules without hardcoding key names.
- **`scripts/modules-on-disk.ts`** — Supplies `REPO_ROOT` so all file paths resolve correctly regardless of the caller's CWD.

## Notes

- The Prometheus token file (`tmp/secrets/prometheus-metrics-token`) is written **unconditionally** on every run. If the file is absent when Docker/Podman sets up the bind mount, the runtime silently creates a *directory* instead, and Prometheus fails to read its credential.
- Re-running `npm run setup` on an already-populated `.env` is a no-op for the env file itself (it skips the write), but it **does** rewrite the Prometheus token file each time.
- Output is deliberately limited to key *names* and status lines; secret values are never printed.
- `COPYFILE_EXCL` (rather than a plain existence check + copy) is the concurrency safeguard: if another process creates `.env` between the `existsSync` check and the copy, the `copyFileSync` call throws instead of clobbering the developer's secrets.
