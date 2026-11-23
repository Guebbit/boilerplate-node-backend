---
source: src/infrastructure/config/dotenv.ts
source_sha256: ff7cf74f2aac57f7a94decc761a628b0f70883c1182262458bafa9a11d0736f1
context_sha256: d22fcea193abac72088a238fa73f7951436e041944e6bd41dd7e83d84be3635a
generated_at: 2026-11-22T02:43:46.317636+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/dotenv.ts

## Purpose
A side-effect-only module that loads `.env` from the working directory into `process.env` and then tells the config store to re-read the environment. Entry points import it first so the store never freezes a snapshot of `process.env` taken before `.env` was loaded.

## Key elements
- `import 'dotenv/config'`: loads `.env` into `process.env`. Keys already set in the shell are not overridden (dotenv's own rule).
- `refreshEnvironment()` (from `./store`): called once at module load, so the store re-reads `process.env`, now including `.env` values, in case it had already read it earlier.
- No exports. The file does its work purely on import.

## Relationships
- `src/infrastructure/config/store.ts`: provides `refreshEnvironment`, which this file calls. The store reads the environment once, which is why this refresh exists.
- Entry points and tooling that import it for the side effect, per the graph: `src/main.ts`, `src/app.ts`, `src/worker.ts`, `scenarios/apply.ts`, `scenarios/support/development-doubles.ts`, `scenarios/tools/generate-seed-images.ts`, and the scripts under `scripts/db/` (`bootstrap-access.ts`, `cache-clear.ts`, `sync-indexes.ts`), `scripts/ops/` (`check-config.ts`, `reapply-erasures.ts`, `reencrypt.ts`, `run-job.ts`) and `scripts/security/refresh-breached-passwords.ts`.

## Notes
- It should be imported first in an entry point. The module header says this ordering is the point of the file.
- Shell-set variables take precedence over `.env`.
- The module header points to the section `#read-once-override-on-top` of a configuration document under `docs/operate/`.
