---
source: scripts/ops/reencrypt.ts
sha256: d7e7785d7128e238597e602a2def4bb2b9e4d7baf9f26ab2f164e85aa5d79ce0
generated_at: 2026-11-08T02:55:38.544001+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reencrypt.ts

## Purpose

One-shot CLI script (`npm run reencrypt`) that re-encrypts every stored secret onto the newest key in its key ring after a rotation deploy. Without it, old key entries can never be dropped because nothing else migrates the rows that still reference them.

## Key elements

- **`dryRun`** – Boolean read via `hasFlag('dry-run')`; when true, no writes occur and the script only reports per-field, per-key-version counts.
- **`walks`** – Flat array of re-encryption functions collected from `enabledModules` (only those exposing `.reencrypt`), in registration order.
- **`runAll(remaining, total)`** – Recursively executes walks **sequentially** (one at a time, so two never contend for the same collection), accumulating a merged `ReencryptReport`.
- **`main()`** – Calls `startJob()` → `runAll(walks)` → logs the final report via `logger.info`.
- **Entry point** – `void runScript(undefined, main, stopDatabase)`; no job name is passed because this is never scheduled.

## Relationships

- **`scripts/cli.ts`** – Provides `hasFlag`, used to detect `--dry-run`.
- **`scripts/run-script.ts`** – Provides `runScript`, the wrapper that manages process lifecycle and error reporting via `process.exitCode`.
- **`src/infrastructure/config/dotenv.ts`** – Imported for its side-effect: loads environment variables before anything else runs.
- **`src/infrastructure/runtime/mongoose-boot.ts`** – Imported for its side-effect: sets Mongoose defaults *before* any schema is built.
- **`src/infrastructure/runtime/database.ts`** – Provides `startJob` (open connection) and `stopDatabase` (cleanup passed to `runScript`).
- **`src/infrastructure/security/reencrypt.ts`** – Provides `emptyReport`, `mergeReports`, and the `ReencryptReport` type used to accumulate results.
- **`src/modules.ts`** – Provides `enabledModules`; the script iterates them to discover which modules expose a `.reencrypt` walk.

## Notes

- **Import order matters:** `dotenv` and `mongoose-boot` must load before any Mongoose model is referenced; they are side-effect imports at the top of the file.
- **Idempotent:** a value already encrypted with the newest key version is left untouched, so re-running the script is safe and writes nothing on the second pass.
- **Sequential by design:** `runAll` runs walks one after another (not in parallel) to avoid two walks writing to the same collection simultaneously.
- **Not scheduled:** there is intentionally no `docker/crontab` entry; this is a post-rotation action, not a recurring job.
- **No floating-promise lint error:** the `void` + `eslint-disable` on the entry line is safe because `runScript` never rejects—failures surface through `process.exitCode`.
