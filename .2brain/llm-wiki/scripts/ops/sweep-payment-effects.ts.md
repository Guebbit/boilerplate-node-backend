---
source: scripts/ops/sweep-payment-effects.ts
sha256: c59e9712c339bda4379dcd1379ed6ac8481a79d32698f20412a737d4ae0591c9
generated_at: 2026-10-01T12:37:03.417045+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-payment-effects.ts

## Purpose

Scheduled sweep (run every 5 minutes via `npm run sweep:payment-effects`) that retries two kinds of incomplete payment work left behind by a crash: (1) settlement effects where `pendingEffects: ['commit']` was written but the stock commit or refund-owed marker was never applied, and (2) provider-side refunds stuck in `failed` or `pending` status. It exists because, unlike webhooks, a settlement that already answered its caller has no other retry path.

## Key elements

- **`main`** – Annotated as the entry point. Connects the database via `start()`, then sequentially calls `paymentService.retryPendingEffects()` and `paymentService.retryOpenRefunds()`. Resolves `void`.
- **`runScript('sweep:payment-effects', main, stopDatabase)`** – Wraps `main` with the project's standard script lifecycle (top-level await, error handling, and `stopDatabase` as the cleanup callback on exit).
- **No module exports** – The file is a side-effect-only script (barrel `@module` doc); it is never imported, only executed by `tsx`.

## Relationships

- **`scripts/run-script.ts`** – Provides `runScript`, the shared lifecycle wrapper (process exit codes, error surfacing, cleanup hook) that every ops script delegates to.
- **`src/infrastructure/runtime/database.ts`** – Supplies `start()` (connect) and `stopDatabase` (disconnect/cleanup) used for the script's DB lifecycle.
- **`src/modules/payments/index.ts`** – Source of `paymentService`, whose `retryPendingEffects()` and `retryOpenRefunds()` methods perform the actual retry logic.
- **`src/modules/payments/services/index.ts`** – The service layer behind `paymentService`; this sweep calls `inventoryService.commitForOrder` and `orderService.markRefundOwed` *through* that layer rather than via emitted events, so no event-listener registration is required.

## Notes

- **Cadence constraint:** Must complete well within the 30-minute stock-reservation hold window; the 5-minute schedule is intentional (see `docs/reference/ops.md#scheduled-jobs`).
- **No event listeners:** Unlike `sweep-order-effects.ts`, this script invokes inventory/order services directly. Adding or removing a listener will not affect it.
- **Idempotency:** Refund retries reuse the original idempotency key, so re-firing is safe against the payment provider.
- **Removal coupling:** This file, the `sweep:payment-effects` npm script entry, and the `docker/crontab` line are all owned by the payments module and must be deleted together.
