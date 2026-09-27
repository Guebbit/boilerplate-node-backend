---
source: scripts/ops/sweep-order-effects.ts
sha256: 1b187d979e28de7dba091423e48cfdfeaf874c5e63b14a8f1225e15d77036f7f
generated_at: 2026-09-27T13:58:24.838464+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-order-effects.ts

## Purpose

Periodic ops script (`npm run sweep:order-effects`) that retries the refund leg of a cancelled order. When `cancelById` fires, it emits `ORDER_REFUND_OWED` so the `payments` module can issue a refund; if the payments provider was unreachable at that moment, the refund never lands. This sweep re-emits `ORDER_REFUND_OWED` for every order whose refund marker is still pending. It does **not** cover the stock/restock half of a cancel.

## Key elements

- **`main`** — async chain: `start()` (DB) → `registerModules(enabledModules)` (installs the `payments` event subscription) → `orderService.retryPendingEffects()`. Resolves to `void`.
- **`runScript('sweep:order-effects', main, stopDatabase)`** — wraps `main` with standard script lifecycle (signal handling, DB teardown on exit).

## Relationships

- **`scripts/run-script.ts`** — supplies the `runScript` wrapper that orchestrates process lifecycle around `main`.
- **`src/infrastructure/runtime/database.ts`** — exports `start` (DB connect) and `stopDatabase` (shutdown), both called here.
- **`src/kernel/registry.ts`** — exports `registerModules`; **required** in this script (unlike other `reap:*` scripts) because the sweep works by emitting an event that only a registered `payments` module will listen to.
- **`src/modules.ts`** — exports `enabledModules`, the list handed to `registerModules`.
- **`src/modules/orders/index.ts`** — exports `orderService`, whose `retryPendingEffects()` is the core action of this script.
- **`src/modules/orders/services/index.ts`** — implementation layer for `orderService.retryPendingEffects()` (re-announces `ORDER_REFUND_OWED` for orders with outstanding refund markers).

## Notes

- **Module registration is load-bearing.** Skipping `registerModules` (as other `reap:*` scripts do) would let the sweep clear every pending marker *without* any refund actually firing, because no `payments` listener would exist to act on the event.
- **Scope gap (stock side).** This script only retries the refund. The restock side is partially covered by `sweep:reservations`, but that query only matches `held` holds — a `committed` hold (restocked by the cancel path) that throws is never retried by either script, and those units stay lost from sale.
- **Idempotent.** `payments` uses a conditional refund, so a second pass over an already-settled order is a no-op.
- **Scheduling.** Intended for the same periodic cron container as the `reap:*` scripts; never run on every boot.
- **Ownership.** Belongs to the `orders` module. Removing the module also removes this script, the `sweep:order-effects` npm entry, and its `docker/crontab` line.
