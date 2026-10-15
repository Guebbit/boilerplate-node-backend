---
source: scripts/ops/reencrypt.ts
sha256: 2b22363182a325d51bd3f3d18054dbf2310f49a7cce7e2ce064c89cdd24bf9a3
generated_at: 2026-10-15T09:44:37.329461+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reencrypt.ts

## Purpose

One-shot ops script (`npm run run reencrypt`) that re-encrypts every stored secret onto the newest key of its encryption key ring. Exists so that, after a key rotation prepends a new key, the old key can eventually be dropped. Not scheduled; run manually after the rotation deploy.

## Key elements

- **`dryRun`** — boolean read from `process.argv`; when `--dry-run` is present, no writes occur and per-field/per-version counts are printed instead.
- **`walks`** — flat array of `AppModule.reencrypt` functions collected from `enabledModules` in registration order. A module without a `reencrypt` method contributes nothing.
- **`runAll(remaining, total)`** — recursively executes walks one after another (never in parallel) so two walks never contend for the same collection. Accumulates a `ReencryptReport` via `mergeReports`.
- **`main()`** — orchestrates the lifecycle: `startJob()` → `runAll(walks)` → log the final report → (cleanup handled by caller).
- **Entry point** — `void runScript(undefined, main, stopDatabase)`. The `undefined` job name signals "manual, unscheduled" execution.

## Relationships

- **scripts/run-script.ts** — wraps `main` with process-lifecycle management (argv parsing, signal handling, exit-code logic).
- **src/infrastructure/config/dotenv.ts** — side-effect import; loads environment variables before anything else runs.
- **src/infrastructure/runtime/mongoose-boot.ts** — side-effect import; sets Mongoose defaults *before* any schema is built.
- **src/infrastructure/runtime/database.ts** — provides `startJob()` (connect) and `stopDatabase()` (disconnect, passed to `runScript` as cleanup).
- **src/infrastructure/adapters/logger.ts** — structured logger used to emit the final report line.
- **src/infrastructure/security/reencrypt.ts** — supplies the `ReencryptReport` type, `emptyReport()` factory, and `mergeReports()` accumulator helper.
- **src/modules.ts** — `enabledModules` is the single source of which modules participate; no module is named here.

## Notes

- **Idempotent:** a value already encrypted with the newest key is skipped, so a second run writes nothing. Safe to re-run if a rotation is deployed incrementally.
- **Sequential, not parallel:** `runAll` intentionally avoids concurrent collection access; if two modules happen to walk the same collection, ordering protects them.
- **No `docker/crontab` entry by design** — key rotation is a one-off event, not a recurring job.
- **Import order matters:** `dotenv` and `mongoose-boot` must load before any model or config is touched; both are bare side-effect imports for that reason.
- **Removed modules vanish automatically** because `walks` is derived from `enabledModules`; there is no hardcoded list to clean up.
