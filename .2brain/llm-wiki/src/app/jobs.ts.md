---
source: src/app/jobs.ts
generated_at: 2026-11-22T02:30:40.187097+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/jobs.ts

## Purpose
Declares the scheduled jobs that belong to no module: the quarantine (upload) reaper, the orphaned-image sweep, the mail-spool reaper and the outbox backstop. Jobs owned by a module are declared on its manifest (`AppModule.jobs`) instead.

## Key elements
- `appJobs: readonly JobDeclaration[]`: the only export. Each entry spreads static metadata from `appJobData.<name>` (imported from `./jobs.generated`) and adds a `run` function.
  - `reapQuarantine`: deletes quarantine files older than `NODE_QUARANTINE_RETENTION_HOURS` (from `imageConfig()`) using `reapDirectory(quarantineRoot(), cutoff, 'Quarantine')`. It logs `checked` and `reaped` counts. `connectFirst: false`.
  - `reapOrphanedImages`: calls `reapOrphanedImages` with the keys of `resolveImageTargets(enabledModules)`.
  - `reapMailSpool`: calls `reapSpooled` with `NODE_MAIL_SPOOL_RETENTION_HOURS` (from `mailFilesConfig()`) converted to ms. It logs only when something was reaped. `connectFirst: false`.
  - `sweepOutbox`: calls `relayOutbox()` and logs the result as "outbox: sweep finished".

## Relationships
- `@kernel/registry`: supplies the `JobDeclaration` type and `resolveImageTargets`.
- `@kernel/outbox`: `relayOutbox` is the body of the outbox sweep.
- `../modules` (`src/modules.ts`): `enabledModules` determines which image targets the orphan sweep covers.
- `@infrastructure/adapters/*`: `logger`, `filesystem` (`reapDirectory`), `config` (`imageConfig`, `mailFilesConfig`), `image-store` (`quarantineRoot`), `mail-spool` (`reapSpooled`) and `orphaned-images` (`reapOrphanedImages`) do the actual work.
- `@domain-primitives/time`: `HOUR_MS` converts the retention hours to milliseconds.
- `scripts/docs/generate-jobs.ts` is probably related to the `./jobs.generated` metadata, though the file content doesn't show this.
- `scripts/ops/run-job.ts`, `tests/cross-cutting/scheduled-jobs.test.ts`, `tests/integration/ops-outbox-sweep-job.test.ts` and `tests/support/drain.ts` are neighbors in the graph. They are presumably consumers of `appJobs`, but the file doesn't show how they use it.

## Notes
- `connectFirst: false` is set on the two filesystem reapers. A comment says the sweep itself never touches Mongo, only the outcome record does. The other two jobs leave it unset.
- Retention windows are deliberately generous. The quarantine comment says a broker outage across a normal maintenance window should lose nothing. The mail-spool comment says mail jobs settle in seconds, so anything older died mid-flight.
- The module header points to the ops reference's "scheduled jobs" section for more detail.
