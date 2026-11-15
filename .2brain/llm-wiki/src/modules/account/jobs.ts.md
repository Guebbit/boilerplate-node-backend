---
source: src/modules/account/jobs.ts
sha256: 8a914880a0ba8c165d68168ad30177bdbab065c21b40c5739a60004f1a9e30f2
generated_at: 2026-11-14T18:36:29.177483+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/jobs.ts

## Purpose

Declares the four scheduled jobs the `account` module owns — inactive-account reaping, lapsed-previous-email cleanup, expired-export sweep, and scheduled-deletion purge — as a single exported `JobDeclaration[]` that the registry picks up at startup.

## Key elements

- **`accountJobs`** (exported) — `readonly JobDeclaration[]` listing the four jobs in execution order: three nightly sweeps followed by the hourly purge. Each entry spreads metadata from `accountJobData` (imported from `./jobs.generated`) and provides a `run` closure.
- **`reapInactive`** (local const) — thin wrapper around `reapInactiveAccounts`; reads `NODE_INACTIVE_ACCOUNT_DAYS` / `NODE_INACTIVE_MINIMISE_DAYS` from `accountConfig()` and short-circuits with a zero-count result (plus an info log) when both values are ≤ 0.
- **Lease settings** — `reapInactive` and `reapScheduledDeletions` declare a 15-minute lease; `reapPreviousEmails` declares a 30-minute lease; `reapAccountExports` has no lease.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `JobDeclaration` type that `accountJobs` conforms to.
- **`src/modules/account/config.ts`** — `accountConfig()` provides the two inactivity-threshold env values used by the `reapInactive` guard.
- **`src/modules/account/services/reap-inactive.ts`** — `reapInactiveAccounts` (and the `InactiveReapCounts` type) is the actual workhorse behind job 1.
- **`src/modules/account/services/previous-email-cleanup.ts`** — `reapLapsedPreviousEmails` backs job 2.
- **`src/modules/account/services/export-rows.ts`** — `reapExpiredExports` backs job 3.
- **`src/modules/account/services/purge-deletions.ts`** — `purgeScheduledDeletions` backs job 4.
- **`src/domain-primitives/time.ts`** — `MINUTE_MS` constant used to express lease TTLs.
- **`src/modules/account/module.ts`** — consumes `accountJobs` to register the module's work with the kernel.
- **`src/modules/account/tests/integration/jobs.test.ts`** — integration tests exercising the four job definitions.

## Notes

- Lease is applied only to jobs that **hard-delete** accounts (reap-inactive, purge-deletions) to guarantee a single concurrent runner; the email and export sweeps are idempotent and omit it.
- The `reapInactive` local is **not** exported; tests must target it through `accountJobs[0].run`.
- `accountJobData` comes from a **generated** file (`./jobs.generated`), so schedule/cron metadata lives outside this source file — edit the generator, not this file, to change cadence.
