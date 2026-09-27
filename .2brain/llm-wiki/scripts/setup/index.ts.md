---
source: scripts/setup/index.ts
sha256: b19a4e0674a78d96e3515a8155194e22a0605760a8bf39bdeac25fa09020289d
generated_at: 2026-09-27T14:00:23.198723+00:00
model: ollama:qwen3.8:27b
---

# scripts/setup/index.ts

## Purpose

Entry point for `npm run setup`. Bootstraps a fresh clone into a runnable state in one command: creates `.env` from `.env-example` (never overwriting an existing one), replaces every still-placeholder secret with a fresh 32-byte random value, and writes the Prometheus `NODE_METRICS_TOKEN` to its dedicated file so the container bind-mount always finds a real file.

## Key elements

- **`ensureEnvironmentFile()`** — Copies `.env-example` → `.env` only if the target is absent. Uses `fsConstants.COPYFILE_EXCL` as a race-condition guard against overwriting.
- **`writeSecretFile(target, content)`** — Atomic write (write to `.tmp-<pid>` then `renameSync`) with `0o600` mode. Creates parent directories as needed. Used for both `.env` and the Prometheus token file.
- **`fillableKeys()`** (from `./required-keys`) — Returns the list of placeholder keys the boot gate would reject. Derived from enabled modules + app-level checks, so new modules are covered automatically.
- **`fillPlaceholders(content, keys)`** (from `./environment-file`) — Replaces placeholder values in the `.env` text with fresh `randomBytes(32)` hex strings; returns the updated content and the list of filled key names.
- **`readEnvironmentValue(content, key)`** (from `./environment-file`) — Extracts a single key's value from the final `.env` content (used to grab `NODE_METRICS_TOKEN` for the Prometheus file).
- **Module-level flow** — Runs sequentially on import (no explicit `main`): ensure file → fill placeholders → write Prometheus token. Logs key *names* only, never values.

## Relationships

- **`scripts/setup/environment-file.ts`** — Provides `fillPlaceholders` (core placeholder→random-value replacement logic) and `readEnvironmentValue` (single-key extraction from the final content).
- **`scripts/setup/required-keys.ts`** — Provides `fillableKeys`, the authoritative list of which keys need filling. The setup script delegates all "what to fill" decisions to this module.

## Notes

- **Never overwrites `.env`.** `COPYFILE_EXCL` on the copy plus the upfront `existsSync` check are a two-layer guarantee. This is the one thing the script must never do.
- **Prometheus token file is written unconditionally.** Docker/Podman silently creates a *directory* at a bind-mount point if the source file is absent, which breaks Prometheus. Writing it every run avoids that.
- **Atomicity convention.** All file writes (`.env`, token file) go through `writeSecretFile` → temp + rename. A crash mid-write cannot leave a truncated secrets file.
- **Permissions.** Secrets files are created `0o600` (owner read/write only).
- **Idempotent for filling.** If every secret is already populated, the script logs "nothing to fill" and skips the write.
