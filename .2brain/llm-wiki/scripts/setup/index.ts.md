---
source: scripts/setup/index.ts
sha256: 12a3c8262bfb1326268d868dc7c744a78a8da509111dc04cbcd3b7a669689d36
generated_at: 2026-10-14T07:32:07.231697+00:00
model: ollama:qwen3.8:27b
---

# scripts/setup/index.ts

## Purpose

Entrypoint for `npm run setup` (B11b). Takes a fresh clone from "no `.env`" to a working one in a single command: bootstraps `.env` from the committed template, fills every still-placeholder secret with a fresh random value, and mirrors the Prometheus metrics token into a file the observability stack reads directly.

## Key elements

- **`ensureEnvironmentFile()`** – Copies `.env-example` → `.env` using `COPYFILE_EXCL`; returns `false` (no-op) if `.env` already exists.
- **`writeSecretFile(target, content)`** – Atomic write (temp file + `renameSync`) with `0600` mode; creates parent directories as needed.
- **Main flow (top-level)** – Orchestrates the three steps: ensure → `fillPlaceholders` → write Prometheus token. Only rewrites `.env` when at least one placeholder was filled, keeping re-runs a no-op.
- **Path constants** – `ROOT`, `ENV_EXAMPLE`, `ENV_FILE`, `METRICS_TOKEN_FILE` anchor all file operations relative to the repo root.

## Relationships

- **`scripts/setup/environment-file.ts`** – Provides `fillPlaceholders(content, keys)` (replaces placeholder lines and reports which keys changed) and `readEnvironmentValue(content, key)` (extracts a single value; used to pull `NODE_METRICS_TOKEN` out of the final content).
- **`scripts/setup/required-keys.ts`** – Provides `fillableKeys()`, the authoritative list of secret keys that the boot gate would refuse if left as placeholders. The setup script does not hard-code key names; it delegates to this function so new modules are covered automatically.

## Notes

- **Never overwrites an existing `.env`.** The `COPYFILE_EXCL` flag is a hard guard against clobbering a developer's live secrets if the file appears between the `existsSync` check and the copy.
- **Idempotent by design.** If every secret is already set, the file is left byte-for-byte untouched and the script reports "nothing to fill."
- **Prometheus token is written unconditionally.** If the target file is missing, Docker/Podman silently creates a *directory* at the bind-mount path, which breaks Prometheus. Writing it every run guarantees a real file exists.
- **Prints key names only, never values** – a deliberate convention to keep secrets out of terminal history.
- **Requires `tsx`** (shebang `#!/usr/bin/env tsx`); run via the `npm run setup` script, not directly with Node.
