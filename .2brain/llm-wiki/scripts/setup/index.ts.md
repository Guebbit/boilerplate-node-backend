---
source: scripts/setup/index.ts
sha256: 81a3910d8508017764170be55c751711c3719ec0f90589346985267d55706251
generated_at: 2026-11-08T03:02:11.186117+00:00
model: ollama:qwen3.8:27b
---

# scripts/setup/index.ts

## Purpose

Entry point for `npm run setup`. On a fresh clone it creates `.env` from `.env-example`, replaces every still-placeholder secret (as identified by the enabled modules' requirements) with a fresh `randomBytes(32)` value, and writes the Prometheus metrics token to a standalone file that the observability stack reads via bind mount.

## Key elements

- **`ensureEnvironmentFile()`** — Copies `.env-example` → `.env` only when `.env` is absent; uses `fsConstants.COPYFILE_EXCL` so a concurrent creation cannot be silently overwritten. Returns `true` if a new file was created.
- **`writeSecretFile(target, content)`** — Atomic write (temp file in same directory + `renameSync`) with mode `0600`; creates parent directories as needed. Used for both `.env` and the Prometheus token file.
- **`ENV_EXAMPLE` / `ENV_FILE` / `METRICS_TOKEN_FILE`** — Resolved from `REPO_ROOT` (imported as `ROOT`); the last points to `tmp/secrets/prometheus-metrics-token`.
- **Top-level flow** — Call `fillPlaceholders(before, fillableKeys())` to get updated content and a list of changed keys; write `.env` back only when `filled.length > 0`; unconditionally write the token file via `readEnvironmentValue(after, 'NODE_METRICS_TOKEN')`.

## Relationships

- **`scripts/setup/environment-file.ts`** — Provides `fillPlaceholders` (replaces placeholder values in a `.env` string) and `readEnvironmentValue` (extracts a single value by key).
- **`scripts/setup/required-keys.ts`** — Provides `fillableKeys()`, the list of secret keys that still need values, derived from enabled modules and app-level checks.
- **`scripts/modules-on-disk.ts`** — Exports `REPO_ROOT`, used as the base path for all file constants in this script.

## Notes

- The Prometheus token file is written **unconditionally** even when `.env` was not modified. This is deliberate: if the file is missing, Docker/Podman interprets the bind-mount target as a directory, causing Prometheus to fail to read its `credentials_file`.
- Re-runs are safe: `.env` is never overwritten, and the file is only rewritten when at least one placeholder was still unfilled.
- Output prints only key **names** (e.g. `filled: FOO_TOKEN, BAR_KEY`), never the generated values.
- The `COPYFILE_EXCL` flag closes the TOCTOU window between the `existsSync` check and the actual copy.
