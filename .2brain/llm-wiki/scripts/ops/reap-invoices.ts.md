---
source: scripts/ops/reap-invoices.ts
sha256: 32983b98b2025bc7db047ee6bb68e059469017290272c98c2c47342bb743c1f1
generated_at: 2026-09-23T17:29:46.362845+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-invoices.ts

## Purpose

Operational script (npm script `reap:invoices`) that sweeps the on-disk invoice PDF cache by running two independent cleanup passes — orphaned and expired invoices — in parallel. Intended for scheduled execution (cron, container task) rather than interactive use.

## Key elements

- **`main`** (not exported) — Connects to the database, then calls `orderService.reapOrphanedInvoices()` and `orderService.reapExpiredInvoices()` concurrently via `Promise.all`. Logs a line only when a count is non-zero.
- **`void runScript(main, stopDatabase)`** — Entry point. Wraps `main` with the shared script lifecycle (startup, error handling, graceful `stopDatabase` teardown).

The file has no public exports; it is a standalone `tsx` script.

## Relationships

- **`scripts/db/run-script.ts`** — Provides `runScript`, which orchestrates the connect → run → cleanup lifecycle around `main` and ensures `stopDatabase` is called even on failure.
- **`src/infrastructure/runtime/database.ts`** — Supplies `start()` (DB connection) and `stopDatabase` (disconnect), both consumed by this script and the `runScript` wrapper.
- **`src/infrastructure/adapters/logger.ts`** — Supplies the structured `logger` used for the two info-level result messages.
- **`src/modules/orders/index.ts`** — Barrel re-export that exposes `orderService`; the script imports from here.
- **`src/modules/orders/services/index.ts`** — Where `orderService` (and its `reapOrphanedInvoices` / `reapExpiredInvoices` methods) is actually implemented.

## Notes

- Both sweeps are **independent and stateless with respect to each other**; they run in parallel and each returns a count of files removed.
- Logging is intentionally quiet: a count of `0` produces no log line, keeping cron output clean on no-op runs.
- The script loads `.env` via `import 'dotenv/config'` at the top; any required env vars must be present in the execution environment.
- Referenced by `docs/reference/ops.md` for operational context.
