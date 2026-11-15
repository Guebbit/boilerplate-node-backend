---
source: scripts/ops/prepare-job.ts
sha256: e5bdc9bc97c732c9566e1b01017328d00592f0baf8a9517c35d25fd45bc60ea8
generated_at: 2026-11-14T17:38:16.988219+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/prepare-job.ts

## Purpose

Shared boot and execution helpers for scheduled jobs. It ensures every job installs the same module subscriptions, rendering assets, and outbox settlement that the web process gets, so a job's output (e.g. a mailed notification) is indistinguishable from one built in the app. `run-job.ts` and the integration tests both call into here to avoid duplicating that setup.

## Key elements

- **`prepareJob(): Promise<void>`** — Calls `registerModules(enabledModules)` to wire up every module's event subscriptions, then calls `bootRendering()` to load translations, mail templates, and the admin-copy overlay from the database. Returns once both are resolved.
- **`runJobWork(job: JobDeclaration): Promise<void>`** — Executes the job's work and then `settleOutboxNudges()`. If `job.lease` is set, the whole sequence runs inside `withLease(name, ttlMs, …)` for mutual exclusion. Logs an info message when the lease was already held and the run was skipped.

## Relationships

- **`scripts/ops/run-job.ts`** — Primary consumer; calls `prepareJob` then `runJobWork` for each declared job.
- **`src/kernel/registry.ts`** — Source of `registerModules` and the `JobDeclaration` type.
- **`src/modules.ts`** — Supplies the `enabledModules` array passed to `registerModules`.
- **`src/app/boot-rendering.ts`** — Called by `prepareJob` to load DB-backed rendering assets.
- **`src/infrastructure/persistence/lease.ts`** — Provides `withLease`, which gates concurrent job execution.
- **`src/kernel/outbox.ts`** — Provides `settleOutboxNudges`, called after job work so pending outbox items are processed before connections close.
- **`src/infrastructure/adapters/logger.ts`** — Used to log the "skipped: another holder already has the lease" info line.
- **`tests/integration/ops-outbox-sweep-job.test.ts`**, **`tests/integration/ops-payment-effects-job.test.ts`**, **`tests/integration/ops-task-overdue-job.test.ts`**, **`tests/integration/ops-webhook-retry-job.test.ts`** — Integration tests that drive a job through `prepareJob` and `runJobWork` rather than exercising the runner internals directly.

## Notes

- **`connectFirst: false`** on a job declaration means `prepareJob` is skipped entirely (the job does not need the DB-backed overlay).
- **Sentinel pattern:** `runJobWork` returns `true` from inside the lease callback because both a skipped lease run and a job whose own result is `undefined` would otherwise be indistinguishable. The `undefined` check is the only "was it skipped?" signal.
- **No per-job opt-in:** every job receives the full module + rendering boot. The module comment notes that an opt-in list has been under-filled three times, so the design is deliberately all-or-nothing.
- Outbox nudges are settled *inside* the lease (before connections close), guaranteeing listeners and any mail they build have completed.
