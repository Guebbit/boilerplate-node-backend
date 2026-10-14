---
source: scripts/ops/reap-payments.ts
sha256: 432032f470526ffe8fecfc94b8bd684c82075da42849ade00e02af55942f8779
generated_at: 2026-10-14T07:25:34.007379+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-payments.ts

## Purpose

Periodic cleanup script that hard-deletes payment attempts that never reached `succeeded` and are past the `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` window (default 30 days). Unlike `reap-orders.ts`, it deletes rather than marks, because a payment that never settled never produced an invoice to retain. Intended to run on a cron schedule alongside the other `reap:*` scripts, never on application boot.

## Key elements

- **`main`** — Promise chain: calls `startJob()`, then `paymentService.reapAbandonedPayments()`, resolves `void`. Contains no domain logic itself; delegates entirely to the payments service.
- **`runScript('reap:payments', main, stopDatabase)`** — Entry-point invocation. Records the run outcome under the `reap:payments` key for `/observability/health` and ensures `stopDatabase` runs on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** — Supplies the `runScript` helper that wraps `main` with observability recording and guaranteed `stopDatabase` cleanup.
- **`src/infrastructure/config/dotenv.ts`** — Imported first (side-effect import) so environment variables (including `NODE_PAYMENT_ABANDONED_RETENTION_DAYS`) are available before anything else loads.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported second; must execute before any Mongoose model/schema is built so that Mongoose defaults are read correctly.
- **`src/infrastructure/runtime/database.ts`** — Provides `startJob` (connects the database) and `stopDatabase` (closes connections).
- **`src/modules/payments/index.ts`** — Re-exports `paymentService`, the module-level service instance this script calls.
- **`src/modules/payments/services/index.ts`** — Contains the `reapAbandonedPayments()` implementation that performs the actual query and deletion.

## Notes

- **Import order is load-bearing.** `dotenv` and `mongoose-boot` are bare side-effect imports that must precede the `database` and `payments` imports. Reordering them can cause Mongoose to build schemas with incorrect defaults.
- **Delete, not soft-mark.** This is intentional: an unsettled payment has no financial artifact (invoice) to preserve, so hard deletion is safe. A payment that *ever* settled is excluded by the service implementation and is never a candidate on any retention timer.
- **Co-removal.** If the payments module is decommissioned, this script, the `reap:payments` npm script, and its `docker/crontab` entry are all removed together (noted in the module doc-comment and `docs/modules/payments.md`).
- **Cron-only.** The script is not safe to run on every boot; it is designed for a periodic schedule in the same cron container as other `reap:*` scripts.
