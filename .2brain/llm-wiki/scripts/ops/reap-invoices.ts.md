---
source: scripts/ops/reap-invoices.ts
sha256: 39425197e76540d5a119eb39bd08dceea522ebc30612dfdbde0b4c1b7e6e6009
generated_at: 2026-09-27T13:57:22.550024+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-invoices.ts

## Purpose

Ops script (invoked via `npm run reap:invoices`) that sweeps the invoice cache by running two independent cleanup sweeps from `orderService`—orphaned PDFs and expired PDFs—in a single pass. Designed to be executed periodically (cron, scheduled container task) rather than manually.

## Key elements

- **`main`** — Connects to the database, fires `orderService.reapOrphanedInvoices()` and `orderService.reapExpiredInvoices()` concurrently via `Promise.all`, then logs the reap count for each (only when > 0). Returns `Promise<void>`.
- **`void runScript('reap:invoices', main, stopDatabase)`** — Entry-point call that wraps `main` with the shared script lifecycle (error handling, graceful DB shutdown on completion or failure).

## Relationships

- **`scripts/run-script.ts`** — Provides `runScript`, which wraps `main` with try/catch, structured error logging, and a post-hook (`stopDatabase`).
- **`src/infrastructure/adapters/logger.ts`** — Supplies the `logger` used to emit structured info messages with the reap counts.
- **`src/infrastructure/runtime/database.ts`** — Provides `start()` (DB connection before sweeps) and `stopDatabase` (passed as the cleanup hook to `runScript`).
- **`src/modules/orders/index.ts`** — Re-exports `orderService`, the concrete object whose methods perform the actual reaping.
- **`src/modules/orders/services/index.ts`** — Upstream definition barrel for `orderService` (the `reapOrphanedInvoices` / `reapExpiredInvoices` methods live here).

## Notes

- Both sweeps run **concurrently** (`Promise.all`), not sequentially.
- Logging is **conditional**: if a sweep reaps 0 files, no log line is emitted for it—useful to keep cron logs quiet during no-op runs.
- Requires `.env` to be loaded (`import 'dotenv/config'` at top) before any DB connection is attempted.
- The file has a `#!/usr/bin/env tsx` shebang, so it can be executed directly without a separate `ts-node`/`tsx` wrapper in `package.json` scripts.
