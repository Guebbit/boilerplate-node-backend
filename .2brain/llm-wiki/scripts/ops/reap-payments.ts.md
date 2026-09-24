---
source: scripts/ops/reap-payments.ts
sha256: 2ea8af383ca37fcf7215565a8ad3dffbc0dcd049aad0e2c9f6d9e241efd84aa3
generated_at: 2026-09-23T17:30:11.460059+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-payments.ts

## Purpose

Standalone ops script (`npm run reap:payments`) that hard-deletes abandoned payment attempts — i.e., payments that never reached `succeeded` or `refunded` — once they exceed the `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` window (default 30 days). Because these payments never represented settled money, no invoice or other record is preserved. Intended to run on a recurring cron schedule, never on container boot.

## Key elements

- **`main`** — Promise chain: starts the database, calls `paymentService.reapAbandonedPayments()`, and resolves with `undefined`.
- **`void runScript(main, stopDatabase)`** — Module-level entry point. Wraps `main` with the shared script lifecycle (env load, connect, execute, cleanup on exit).

## Relationships

- **`scripts/db/run-script.ts`** — Supplies `runScript`, the shared wrapper that manages connect → execute → `stopDatabase` ordering and error propagation for all `scripts/db` and `scripts/ops` entry points.
- **`src/infrastructure/runtime/database.ts`** — Supplies `start` (connect pool) and `stopDatabase` (teardown) used inside `main` and passed to `runScript`.
- **`src/modules/payments/index.ts`** — Exports `paymentService`, the facade whose `reapAbandonedPayments()` performs the actual deletion query.
- **`src/modules/payments/services/index.ts`** — Houses the concrete service implementation behind the `paymentService` facade; the retention-window logic lives here.

## Notes

- **Delete vs. retain:** Unlike `reap-orders.ts` (which keeps invoices), this script issues a hard `DELETE`. The rationale: an unsettled payment is an abandoned checkout, not a financial record.
- **Settled payments are excluded:** Any payment that ever reached `succeeded` or `refunded` is never a candidate, regardless of age. See `docs/modules/payments.md` (retention section) for the full policy.
- **Cron-only:** Do not wire this into container startup; it is designed for the same periodic cron container as other `reap:*` scripts.
- **Removal path:** If the payments module is removed, delete this file, the `reap:payments` npm script, and its `docker/crontab` entry together.
