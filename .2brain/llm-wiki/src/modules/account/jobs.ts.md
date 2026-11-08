---
source: src/modules/account/jobs.ts
sha256: 5d9d25b651ff4e61aff79c7d18afb9c89592003609fb2bab630947aff1188424
generated_at: 2026-11-08T04:10:16.187576+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/jobs.ts

## Purpose

Declares the four scheduled jobs the `account` module owns — inactive-account reaping, lapsed previous-email cleanup, expired export cleanup, and purge of accounts past their self-deletion grace period — as a single `JobDeclaration[]` consumed by the kernel scheduler.

## Key elements

- **`reapInactive`** *(internal)* — Reads `NODE_INACTIVE_ACCOUNT_DAYS` / `NODE_INACTIVE_MINIMISE_DAYS` from `accountConfig()` at call time; short-circuits with a zero-count result if both are ≤ 0; otherwise delegates to `reapInactiveAccounts`.
- **`accountJobs`** *(exported, `readonly JobDeclaration[]`)* — The four job entries in execution order. Each spreads metadata/schedule from `jobs.generated` and supplies the `run` closure, optional `needs` (subscriptions, i18n), and optional `lease` TTL.

## Relationships

- **`src/kernel/registry.ts`** — provides the `JobDeclaration` type that shapes every entry in `accountJobs`.
- **`src/modules/account/config.ts`** — `accountConfig()` is called inside `reapInactive` to read the two env-driven dials.
- **`src/modules/account/services/reap-inactive.ts`** — supplies `reapInactiveAccounts` and the `InactiveReapCounts` return type.
- **`src/modules/account/services/previous-email-cleanup.ts`** — supplies `reapLapsedPreviousEmails`.
- **`src/modules/account/services/export-rows.ts`** — supplies `reapExpiredExports`.
- **`src/modules/account/services/purge-deletions.ts`** — supplies `purgeScheduledDeletions`.
- **`src/infrastructure/adapters/logger.ts`** — `logger` is used to log the no-op path of `reapInactive` and the completion of the email/export sweeps.
- **`src/domain-primitives/time.ts`** — `MINUTE_MS` is used to express lease TTLs (15 min / 30 min).
- **`src/modules/account/module.ts`** — consumes the exported `accountJobs` array to register them with the scheduler.
- **`src/modules/account/tests/integration/jobs.test.ts`** — integration tests exercising the job declarations.

## Notes

- Job metadata (schedule, id, description) lives in the generated file `jobs.generated`; this file only wires the `run` closures and runtime options.
- `reapInactive` and `purgeScheduledDeletions` are **leased** (15 min TTL) because they hard-delete accounts; the email and export sweeps are not (or use a 30-min lease for email only).
- `needs: { subscriptions, i18n }` is set only on jobs that send mail or resolve erase hooks from manifests — the scheduler uses this to provision those services before `run` is called.
- The config dials are read **at invocation time**, not at module load, so a config hot-reload can toggle the reaper on/off without a process restart.
