---
source: scripts/ops/prepare-job.ts
source_sha256: afc7fb05b039b72f7e0c783d5e1d67b145d3f6958f4ad583f4ab92beb0cdb156
context_sha256: 37ae70c0bc9d5759273ce099da859358699b71b4ce2f112cea6f8013bfdbfcb9
generated_at: 2026-11-22T02:11:16.361828+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/ops/prepare-job.ts

## Purpose
Provides the shared pieces of a scheduled job's lifecycle: what gets installed before the job runs (`prepareJob`) and how the work itself is executed (`runJobWork`). It is shared by `run-job.ts` and by tests that drive a job through the runner's own path. Every job boots the same way the app does, so mail built in cron reads like mail built in the web process. There is deliberately no per-job opt-in.

## Key elements
- **`prepareJob()`**: Calls `registerModules(enabledModules)` to install every module's event subscriptions, then `bootRendering()` to install translations, mail templates and the admin copy overlay. Returns a `Promise<void>`.
- **`runJobWork(job)`**: Runs `job.run()` and then `settleOutboxNudges()`, so listeners (and the mail they build) have finished before connections close. If `job.lease` is set, the work runs inside `withLease(job.name, job.lease.ttlMs, ...)`. If the lease is held by someone else, the job is skipped and an info log line is written.

## Relationships
- **`scripts/ops/run-job.ts`**: the runner that uses these helpers.
- **Integration tests** (`ops-outbox-sweep-job`, `ops-payment-effects-job`, `ops-task-overdue-job`, `ops-webhook-retry-job`): call these helpers to run a job through the same path as the runner.
- **`src/kernel/registry.ts`**: supplies `registerModules` and the `JobDeclaration` type (`name`, `run`, optional `lease` with `ttlMs`).
- **`src/modules.ts`**: supplies `enabledModules`, the list passed to `registerModules`.
- **`src/app/boot-rendering.ts`**: supplies `bootRendering`.
- **`src/kernel/outbox.ts`**: supplies `settleOutboxNudges`, called after the job's work.
- **`src/infrastructure/persistence/lease.ts`**: supplies `withLease`, which provides mutual exclusion for leased jobs.
- **`src/infrastructure/adapters/logger.ts`**: supplies `logger`, used for the "skipped" message.

## Notes
- `prepareJob` needs the database, because the overlay is read from it. Jobs declared with `connectFirst: false` skip it.
- Subscriptions must be registered because events go unheard without them, and the outbox relay refuses to run with none.
- `settleOutboxNudges()` runs inside the lease, so settling completes before the lease is released.
- `withLease` returns `undefined` for a skipped run, and a job's own result is often `undefined` too. The code therefore wraps the job in `.then(() => true)` so that "ran" can be told apart from "skipped".
