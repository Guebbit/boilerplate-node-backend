---
source: scripts/ops/sweep-payment-effects.ts
sha256: 8dad9d60e7c2ffc1240484125342a4e85ffa7984b2677b2a1fac11401be2ae17
generated_at: 2026-09-27T13:58:34.060865+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-payment-effects.ts

## Purpose

Scheduled recovery script that retries payment settlement effects (stock commit or refund marking) left incomplete by a crash between `settlePayment`'s two-step write. It exists because, unlike webhook-driven retries, nothing else redelivers a settlement that already answered its caller. Runs every 5 minutes via `npm run sweep:payment-effects`.

## Key elements

- **`main`** (module-local) — Connects the database, calls `paymentService.retryPendingEffects()`, resolves `void`. No arguments, no return value; it is the entire logic of the script.
- **Top-level invocation** — `void runScript('sweep:payment-effects', main, stopDatabase)` wires `main` into the standard script runner with `stopDatabase` as the teardown callback.

## Relationships

- **`scripts/run-script.ts`** — Provides `runScript`, the shared wrapper that manages the script lifecycle (DB start → `main` → DB stop → process exit). This file delegates all process plumbing to it.
- **`src/infrastructure/runtime/database.ts`** — Supplies `start` (used inside `main`'s promise chain) and `stopDatabase` (passed to `runScript` as the shutdown hook).
- **`src/modules/payments/index.ts`** — Exports `paymentService`, the sole business-logic dependency. The script calls `retryPendingEffects()` on it and imports nothing else from the module.
- **`src/modules/payments/services/index.ts`** — The service layer barrel from which `paymentService` is ultimately composed; this script is the caller at the top of that chain.

## Notes

- **No module registration / event listeners required.** Unlike its sibling `sweep-order-effects.ts`, this script calls `inventoryService.commitForOrder` and `orderService.markRefundOwed` *inside* `retryPendingEffects()` rather than emitting a domain event, so it has no listener registration dependency.
- **Timing constraint.** Must complete well within the 30-minute stock-reservation hold; the 5-minute cadence leaves a 6× safety margin.
- **Removal coupling.** This file, the `sweep:payment-effects` npm script, and its `docker/crontab` line are all owned by the payments module and should be deleted together when that module is removed.
