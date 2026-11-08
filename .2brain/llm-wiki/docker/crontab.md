---
source: docker/crontab
sha256: b0deacc79358ea72c7062866e2066bbbdbf96b306960807a7d63b3da18dbaf6c
generated_at: 2026-11-08T02:19:45.366652+00:00
model: ollama:qwen3.8:27b
---

# docker/crontab

## Purpose
Crontab file consumed by the `cron` service container (defined in `docker-compose.yml`) via supercronic. It is **generated** by `npm run regenerate` from the `jobs` declared on each module's manifest (`AppModule.jobs`) and `src/app/jobs.ts`. It should never be hand-edited; changes belong in the declaring module, and deleting a module removes its entries on the next regeneration.

## Key elements
- **`reap:*` jobs** — idempotent cleanup/deletion tasks (quarantine files, orphaned images, mail spool, inactive accounts, previous emails, account exports, scheduled deletions, delivery notes, invoice PDFs, invoice buyer blocks, order PII, payments, return notes, purchase holds). Each runs `scripts/ops/run-job.ts reap:<name>`.
- **`sweep:*` jobs** — recurring action/notification tasks (outbox publish, preorder reminders, reservation expiry, payment-effect retries, staff digest, staff weekly, stock alerts, task-overdue notices, webhook retries). Each runs `scripts/ops/run-job.ts sweep:<name>`.
- **`scripts/ops/run-job.ts`** — shared runner that guarantees a non-zero exit on failure, closes the Mongo connection on both paths, and records each run's outcome for `/observability/health`.
- **`node --import tsx`** — every entry invokes Node with the `tsx` loader so the TypeScript job files run directly.
- **`cd /app &&`** — every line changes into the app root before spawning Node.

## Relationships
- **`docker-compose.yml`** — defines the `cron` service (and `docker-compose.production.yml` its production variant) that starts supercronic with `-passthrough-logs` and mounts this file at `/app/crontab`. Supercronic's own log stream is what Promtail ships as the container log; this file deliberately contains no output redirects because of that.

## Notes
- **Generated artifact**: treat as read-only. Editing this file directly will be overwritten on the next `npm run regenerate`.
- **No stdout/stderr redirects**: supercronic is launched with `-passthrough-logs`, so each job's output flows straight into the container log stream. Adding `> /dev/null` or `2>&1` here would break that pipeline.
- **Scheduling conventions**: `reap` jobs are mostly daily (various minutes past 02:00) to batch cleanup; `sweep` jobs that need high frequency (outbox, reservations, payment-effects) run every minute or every 5 minutes. Staff-digest and staff-weekly run at 06:30.
- **Retention windows** are driven by environment variables (e.g. `NODE_INACTIVE_MINIMISE_DAYS`, `NODE_ACCOUNT_EXPORT_TTL_DAYS`, `NODE_ACCOUNT_DELETION_GRACE_DAYS`) rather than values baked into the crontab.
- See `docs/reference/ops.md#scheduled-jobs` for per-job rationale and safety notes.
