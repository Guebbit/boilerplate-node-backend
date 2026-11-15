---
source: docker/crontab
sha256: 03a0dfcd9cc290862f82955f5e4bae2250dffc4c0c5bcdfd27404ca7fa1cc43f
generated_at: 2026-11-14T17:11:11.139843+00:00
model: ollama:qwen3.8:27b
---

# docker/crontab

## Purpose

Generated crontab consumed by the `cron` service container (supercronic). It declares every scheduled job for the deployment—cleanup, backstop sweeps, staff notifications—each routed through a single wrapper script. The file is **not hand-edited**; it is produced from per-module job declarations on every regeneration.

## Key elements

- **`npm run regenerate`** – the only supported way to (re)create this file. It reads `AppModule.jobs` from each module's manifest plus `src/app/jobs.ts`. Deleting a module removes its entries on the next run.
- **`scripts/ops/run-job.ts <job:slug>`** – universal wrapper invoked by every line. Guarantees non-zero exit on failure, closes the Mongo connection on both paths, and records the run's outcome for `/observability/health`.
- **Reap jobs** (one-shot deletions / field unsetting, mostly at 02:xx): `quarantine`, `orphaned-images`, `mail-spool`, `inactive-accounts`, `previous-emails`, `account-exports`, `scheduled-deletions`, `delivery`, `invoice-pdfs`, `invoices`, `orders`, `payments`, `returns`, `purchase-holds`.
- **Sweep jobs** (active processing / backstops, higher frequency): `outbox` (every min), `preorders` (daily), `reservations` (every 5 min), `payment-effects` (every 5 min), `stock-alerts` (every 5 min), `staff-digest` (daily 06:30), `staff-weekly` (Monday 06:30), `tasks-overdue` (daily 06:40), `webhook-retries` (every min).

## Relationships

- **`docker-compose.yml`** – defines the `cron` service that mounts this file at `/app/crontab` and runs supercronic with `--passthrough-logs`. Without the container, this file has no runtime consumer.

## Notes

- **Never edit by hand.** Change the `jobs` declaration on the owning module (or `src/app/jobs.ts`) and run `npm run regenerate`.
- **No `>` / `>>` redirects.** Supercronic's `--passthrough-logs` hands stdout/stderr straight to the container log stream (shipped by Alloy). Adding redirects would suppress them.
- **Retention windows are env-driven** (`NODE_INACTIVE_MINIMISE_DAYS`, `NODE_ACCOUNT_EXPORT_TTL_DAYS`, `NODE_ACCOUNT_DELETION_GRACE_DAYS`, etc.), so behaviour changes without touching this file.
- The `cd /app &&` prefix on every line is load-bearing: supercronic does not set the working directory.
- `node --import tsx` means jobs run as TypeScript directly—no build step required at deploy time.
