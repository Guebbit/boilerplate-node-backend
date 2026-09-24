---
source: scripts/ops/sweep-order-effects.ts
sha256: ecffb46cc8bb4722aa0d427c611e9a1c840387340c98649f9fd552d23832b769
generated_at: 2026-09-23T17:30:41.250744+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-order-effects.ts

## Purpose

Periodic ops script (`npm run sweep:order-effects`) that retries order-cancellation refund effects the event bus could not deliver. A cancel releases the stock hold (self-healing via `expiresAt`) but the refund depends on `ORDER_CANCELLED` being received by `payments`; if the provider was unreachable, the refund never fires. This script re-emits that event for every order still marked as pending, and is safe to re-run because `payments` uses a conditional refund.

## Key elements

- **`main`** — async pipeline: `start()` → `registerModules(enabledModules)` → `orderService.retryPendingEffects()` → resolve. Does no further cleanup; lifecycle is delegated to `runScript`.
- **`runScript(main, stopDatabase)`** — wraps `main` with process-exit handling and calls `stopDatabase` on the way out.
- **`enabledModules`** (from `@modules`) — the list passed to `registerModules`; determines which listeners (notably `payments`) are active during the sweep.

## Relationships

- **`scripts/db/run-script.ts`** — generic script runner; wraps `main`, maps unhandled rejections to non-zero exit, invokes `stopDatabase` on completion.
- **`src/infrastructure/runtime/database.ts`** — `start()` opens the connection pool before any service call; `stopDatabase` tears it down after `main` settles.
- **`src/kernel/registry.ts`** — `registerModules` wires domain-event subscriptions. Without it, `ORDER_CANCELLED` has no `payments` listener and the sweep would clear markers without refunding.
- **`src/modules.ts`** — exports the `enabledModules` array consumed by `registerModules`.
- **`src/modules/orders/index.ts`** — re-exports `orderService`.
- **`src/modules/orders/services/index.ts`** — implements `orderService.retryPendingEffects()`, the actual query-and-re-emit logic this script drives.

## Notes

- **Module registration is mandatory here** (unlike the other `reap:*` scripts, which can skip it). The sweep's mechanism is *emit an event and let a listener act*; no listener → no refund → markers cleared for nothing.
- **Idempotent by design.** `payments` performs a conditional refund, so a second pass over an already-settled order is a no-op. Safe to overlap with a concurrent run.
- **Never on boot.** Intended for a cron schedule (same container as other `reap:*` scripts). Running it on every boot would hammer the DB and the provider for no gain.
- **Removal is coupled to the `orders` module.** Deleting the module also requires removing this file, the `sweep:order-effects` npm script, and the corresponding `docker/crontab` entry.
