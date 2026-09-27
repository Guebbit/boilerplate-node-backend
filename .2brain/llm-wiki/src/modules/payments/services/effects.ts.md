---
source: src/modules/payments/services/effects.ts
sha256: 66286b288624c6a6d60069c89578f8d2f1ab83227c9f8acc8712d84e342d7344
generated_at: 2026-09-27T15:25:42.591771+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/effects.ts

## Purpose

Crash-recovery sweep that discharges the one effect a `succeeded` payment write may have left owing: either committing stock for the order, or marking a refund owed if the order moved away before settlement's own `orderLost` branch could react. It exists solely to catch the window between writing `succeeded` and completing the side-effect; `settlement.ts` handles the normal path itself.

## Key elements

- **`retryPendingEffects()`** (exported) — Entry point. Finds up to `SWEEP_BATCH_SIZE` payments past the retry cutoff, iterates them sequentially, and returns the count settled. Logs a warning if the batch was full (more work remains) and an info line summarising the run.
- **`retryOne(payment)`** (module-private) — Resolves a single payment's owed effect: checks order status → commits stock via `inventoryService`, or calls `orderService.markRefundOwed` if the order already advanced. Always clears the `pendingEffects` marker on success. Returns `false` on any error so the marker persists for the next sweep.
- **`SWEEP_BATCH_SIZE`** (const, `200`) — Per-pass cap; hitting it triggers the "run it again" warning.

## Relationships

- **`src/modules/payments/repository.ts`** — Reads due payments (`findWithPendingEffects`) and clears the marker (`clearPendingEffects`).
- **`src/modules/payments/model.ts`** — Provides the `PaymentDocument` type for the parameter of `retryOne`.
- **`src/modules/payments/config.ts`** — Supplies `paymentEffectRetryMinutes()` for the age cutoff.
- **`src/modules/orders/services/index.ts`** / **`src/modules/orders/index.ts`** — Exports `orderService` (used for `getById`, `markRefundOwed`) and the `stockCommitted` status predicate.
- **`src/modules/inventory/index.ts`** / **`src/modules/inventory/service.ts`** — Exports `inventoryService.commitForOrder` for the stock-commit path.
- **`src/modules/orders/domain/lifecycle.ts`** — Defines the order statuses that `stockCommitted` and the `orderLost` branch reference.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging for errors, the batch-cap warning, and the run summary.
- **`src/modules/payments/services/index.ts`** — Barrel re-export making `retryPendingEffects` available to external callers (notably `scripts/ops/sweep-payment-effects.ts`).
- **`src/modules/payments/tests/integration/service.test.ts`** — Integration coverage for the settlement path this file backstops.

## Notes

- **Sole caller is the ops script** (`scripts/ops/sweep-payment-effects.ts`); no runtime code path invokes `retryPendingEffects` directly. Treat it as a manual/automated cron job, not a request-time service.
- **Sequential by design** — mirrors the sweep shape in `orders/services/cancel.ts`. Do not parallelise without re-evaluating the stock-commit idempotency guarantees.
- **Marker is the retry mechanism** — on failure the `pendingEffects` field is left intact; the next sweep re-attempts. There is no in-process retry or queue.
- **Stryker annotations** (`// Stryker disable … restore`) wrap the `logger` calls so mutation testing does not flag no-op mutations on the log statements. Preserve these when editing nearby code.
- The `cutoff` uses `paymentEffectRetryMinutes()` from config, so the effective retry delay is environment-configurable, not hardcoded.
