---
source: scripts/ops/reap-payments.ts
sha256: 49522785ffeba4d4661b2c9caa05b87b668fbca8af26b45299043c7d61693528
generated_at: 2026-09-27T13:57:51.604976+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-payments.ts

## Purpose
Cron-driven cleanup script (`npm run reap:payments`) that permanently deletes payment attempts which never reached `succeeded` or `refunded` and have been untouched for longer than the retention window (`NODE_PAYMENT_ABANDONED_RETENTION_DAYS`, default 30 days). Unlike `reap-orders.ts`, there is no invoice to preserve—an abandoned payment is simply an open checkout the customer walked away from.

## Key elements
- **`main`** — Connects the database, calls `paymentService.reapAbandonedPayments()`, and resolves. No return value; the script's sole job is the deletion side-effect.
- **`void runScript('reap:payments', main, stopDatabase)`** — Entry point. Wraps `main` with the shared script runner (logging, error handling) and registers `stopDatabase` as the cleanup callback.
- **`#!/usr/bin/env tsx`** — Shebang indicating direct execution via `tsx`; in practice it is invoked through the npm script, not called directly.

## Relationships
- **`scripts/run-script.ts`** — Provides `runScript`, the shared wrapper that manages lifecycle (startup, error reporting, graceful shutdown) for all `reap:*` scripts.
- **`src/infrastructure/runtime/database.ts`** — Supplies `start` (opens the connection before the query) and `stopDatabase` (passed to `runScript` as the teardown hook).
- **`src/modules/payments/index.ts`** — Exports the `paymentService` singleton that this script delegates to.
- **`src/modules/payments/services/index.ts`** — Implementation home of `reapAbandonedPayments()`, the actual deletion query.

## Notes
- **Settled payments are never touched.** Any payment that reached `succeeded` or `refunded` is excluded by design; see `docs/modules/payments.md` retention section for the policy rationale.
- **Cron, not boot.** Intended to run in the same cron container as the other `reap:*` scripts. Do not add it to a startup sequence.
- **Removal contract.** Deleting this file requires also removing the `reap:payments` npm script entry and its `docker/crontab` line, plus the owning module code.
- **`dotenv/config`** is imported first, so `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` (and DB credentials) must be available in the environment before the script executes.
