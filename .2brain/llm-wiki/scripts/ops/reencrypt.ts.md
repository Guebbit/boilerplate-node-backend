---
source: scripts/ops/reencrypt.ts
sha256: d7e7785d7128e238597e602a2def4bb2b9e4d7baf9f26ab2f164e85aa5d79ce0
generated_at: 2026-10-29T01:40:13.477604+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reencrypt.ts

## Purpose

CLI operation script (run via `npm run reencrypt`) that re-encrypts every stored secret onto the newest key of its encryption ring. It exists so that, after a key rotation prepends a new key, old rows are migrated and the superseded key can eventually be dropped. Supports `--dry-run` to report per-field, per-key-version counts without writing.

## Key elements

- **`dryRun`** — boolean parsed from CLI args via `hasFlag('dry-run')`; passed into each walk.
- **`walks`** — array of re-encrypt functions collected from `enabledModules` (skips modules that define no `reencrypt`).
- **`runAll(remaining, total)`** — recursively executes walks one at a time (no parallel collection access), merging each module's `ReencryptReport` into a cumulative total.
- **`main()`** — calls `startJob()`, runs all walks, logs the final merged report via `logger.info`.
- **Entry point** — delegates to `runScript(undefined, main, stopDatabase)`; `undefined` job name signals "manual, not scheduled."

## Relationships

- **`scripts/run-script.ts`** — `runScript` wraps the main function with process-exit handling; `stopDatabase` (from database) is passed as the cleanup callback.
- **`scripts/cli.ts`** — `hasFlag` reads `--dry-run` from `process.argv`.
- **`src/infrastructure/config/dotenv.ts`** — side-effect import; must load before anything reads env vars.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — side-effect import; sets Mongoose connection defaults that are read at schema-build time, so it must precede any model import.
- **`src/infrastructure/runtime/database.ts`** — `startJob` opens the DB connection; `stopDatabase` closes it after the script exits.
- **`src/infrastructure/security/reencrypt.ts`** — supplies the `ReencryptReport` type plus `emptyReport` / `mergeReports` helpers used to aggregate per-module results.
- **`src/modules.ts`** — `enabledModules` is the single source for which modules contribute a re-encrypt walk; a disabled or removed module is silently excluded.

## Notes

- **Idempotent:** a value already encrypted with the newest key is left untouched, so a second run is a no-op.
- **Sequential execution:** walks run one-after-another specifically to avoid two walks contending for the same collection.
- **Not scheduled:** there is no crontab/docker entry; rotation is an event, not a cadence.
- **Import order is load-bearing:** `dotenv` and `mongoose-boot` must be the first two imports so that env vars and Mongoose defaults are in place before any schema is built transitively.
- **Floating-promise lint suppressed:** `runScript` never rejects (it sets `process.exitCode` on failure), so the `void` call is safe.
