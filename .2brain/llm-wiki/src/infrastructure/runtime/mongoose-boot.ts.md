---
source: src/infrastructure/runtime/mongoose-boot.ts
source_sha256: 11b4f58dccabf6ddd68d571827b8a55d92349aa2be0ea5510f3e844f2f15774d
context_sha256: 1c720bf24fd2cc607add31a7f44ef6f079fcdd1cb2ee020ab928fecbf094aa00
generated_at: 2026-11-22T03:06:17.632252+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/mongoose-boot.ts

## Purpose
A side-effect-only module that applies the Mongoose defaults at process start. Entry points import it as their first project import so the defaults are in place before any model module is evaluated. Calling `applyMongooseDefaults()` after the imports would be too late, because ES imports are hoisted above it. Putting the call in its own module's top level gets around this.

## Key elements
- **Module body**: imports `applyMongooseDefaults` from `./mongoose-defaults` and calls it immediately on load.
- **No exports**: the file is meant to be imported for its side effect only (`import './mongoose-boot'`).

## Relationships
- **`mongoose-defaults.ts`**: the only dependency. It defines `applyMongooseDefaults`, which this file invokes.
- **Entry points and tooling that import it for the side effect**: the neighbor files are `src/main.ts`, `src/serve.ts`, `src/worker.ts`, `scenarios/apply.ts`, `scenarios/run-server.ts`, `scripts/db/bootstrap-access.ts`, `scripts/db/sync-indexes.ts`, `scripts/ops/reapply-erasures.ts`, `scripts/ops/reencrypt.ts`, `scripts/ops/run-job.ts`, `tests/support/setup.ts` and `tests/replicas/support/write-notification.ts`.

## Notes
- Import order matters. This must be the first project import of an entry point, ahead of anything that pulls in model modules.
- Reordering imports (for example with an auto-sorter) can silently break the guarantee.
