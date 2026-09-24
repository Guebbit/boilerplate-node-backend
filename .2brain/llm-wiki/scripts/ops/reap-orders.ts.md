---
source: scripts/ops/reap-orders.ts
sha256: 8f2597631d8934fba5d71f8518e172fdff54a1a06161cf24ab6eb296f609a4e2
generated_at: 2026-09-23T17:30:02.796889+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-orders.ts

## Purpose

Periodic cron script (`npm run reap:orders`) that anonymizes PII on orders past their retention window. It never deletes an order row (orders are invoices retained under Art. 17(3)(b)/(e)); it only replaces the person-specific fields (email, shipping name/phone/street) with placeholders while preserving amounts, line items, dates, city, and country. It is the "other half" of the `USER_DELETED` listener in the orders module, which stamps `anonymizeAfter` when an account is erased.

## Key elements

- **`main`** — `Promise<void>` function that calls `start()` to open the DB, then `orderService.anonymizeDueOrders()` to perform the anonymization, then resolves `undefined`.
- **`runScript(main, stopDatabase)`** — delegates lifecycle (connect → run → teardown, error handling) to the shared script runner.
- Shebang `#!/usr/bin/env tsx` — executed directly via `tsx`, not compiled.

## Relationships

- **`scripts/db/run-script.ts`** — supplies `runScript`, which wraps `main` with the `stopDatabase` teardown callback for graceful shutdown on success *and* failure.
- **`src/infrastructure/runtime/database.ts`** — exports `start` (used by `main` to open the connection) and `stopDatabase` (passed to `runScript` as the cleanup function).
- **`src/modules/orders/index.ts`** — barrel export from which `orderService` is imported.
- **`src/modules/orders/services/index.ts`** — the concrete source of `orderService`; the `anonymizeDueOrders()` method called here lives in that service layer.

## Notes

- Intended for **periodic cron** (same container as other `reap:*` scripts); do not run on every boot.
- The script is owned by the `orders` module: removing the module means removing this file, the `reap:orders` npm script, and its `docker/crontab` line together.
- Loading order matters: `dotenv/config` is imported before anything else so `.env` values are available when `start()` opens the connection.
- `main` deliberately resolves `undefined` rather than a count — the script is fire-and-forget; operators inspect logs/DB to verify.
