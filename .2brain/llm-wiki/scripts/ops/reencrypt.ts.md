---
source: scripts/ops/reencrypt.ts
source_sha256: 0a5f8e7626269ccf99b389e80942a839b44d165c370fac3411085820bfcd58c4
context_sha256: 921731f897c8bfd28836f6f1d07255c1d86c566e040644d9b36b5118de20c24e
generated_at: 2026-11-22T02:11:45.843726+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/ops/reencrypt.ts

## Purpose
Manual ops script (`npm run reencrypt`) that re-encrypts every stored secret onto the newest key of its ring. A key rotation prepends a new key and keeps the old one so existing rows still decrypt. Nothing else migrates those rows, so the old key cannot be dropped until this runs. Run it after the rotation deploy, then remove the old key entry.

## Key elements
- `dryRun` — true when `--dry-run` is passed. Nothing is written; per-field counts of values on each key version are reported.
- `walks` — the `reencrypt` function of each enabled module that defines one, in registration order.
- `runAll(remaining, total)` — runs the walks sequentially (so two never contend for the same collection), merging each report into the running total.
- `main` — calls `startJob()`, runs all walks, then logs `Re-encryption finished.` with `dryRun` and the merged report.
- Entry point: `void runScript(undefined, main, stopDatabase)`. The job name is `undefined` because the script is run by hand, not scheduled.

## Relationships
- `src/modules.ts` — supplies `enabledModules`; each enabled module's optional `reencrypt` walk is collected into `walks`. The script names no module, so a removed module takes its walk with it.
- `src/infrastructure/security/reencrypt.ts` — provides `emptyReport`, `mergeReports` and the `ReencryptReport` type.
- `scripts/run-script.ts` — `runScript` wraps `main` and `stopDatabase`. It never rejects.
- `scripts/cli.ts` — `hasFlag` parses `--dry-run`.
- `src/infrastructure/runtime/database.ts` — `startJob` connects; `stopDatabase` is the cleanup passed to `runScript`.
- `src/infrastructure/runtime/mongoose-boot.ts` — imported for its side effects before any model loads.
- `src/infrastructure/config/dotenv.ts` — imported for its side effects to load environment config.
- `src/infrastructure/adapters/logger.ts` — exports `logger`, used to emit the final report.

## Notes
- Import order matters: `dotenv`, then `mongoose-boot`, must come first. Mongoose defaults are read at schema build time, so `mongoose-boot` has to run before any model loads.
- Idempotent: a value already on the newest key is not touched, so a second run writes nothing.
- Intentionally not scheduled, so there is no `docker/crontab` entry. A rotation is an event, not a cadence.
- The `no-floating-promises` ESLint rule is disabled on the entry line because `runScript` never rejects.
