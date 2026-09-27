---
source: scripts/ops/sweep-reservations.ts
sha256: 2325f6716f9c8be38331ffc60845a09046905f7b3f6f5ac7b8390736e0cf9a53
generated_at: 2026-09-27T13:58:45.848600+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-reservations.ts

## Purpose

Scheduled ops script (cron, every 5 min) that expires every stale inventory reservation hold. It exists because the equivalent admin route (`POST /inventory/reservations/sweep`) had no other caller, so an abandoned checkout could hold stock units indefinitely.

## Key elements

- **`main`** — async pipeline: starts the database → registers all enabled modules → boots i18n → calls `inventoryService.runReservationSweep()` → resolves to `undefined`.
- **`runScript('sweep:reservations', main, cleanup)`** — top-level entry point (called with `void`); wraps execution with the shared script lifecycle and runs `stopDatabase()` + `stopQueue()` on exit.

## Relationships

- **`scripts/run-script.ts`** — provides `runScript`, the shared wrapper that handles process-level setup/teardown for one-shot scripts.
- **`src/infrastructure/runtime/database.ts`** — `start()` connects the DB before the sweep; `stopDatabase()` is in the cleanup callback.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue()` is in the cleanup callback (queue adapter may be touched transitively by module registration or the sweep).
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` installs event subscriptions so the `RESERVATION_EXPIRED` event emitted by the sweep reaches the `orders` module's listener.
- **`src/modules.ts`** — supplies `enabledModules` and `enabledModuleLocales()` used during bootstrap.
- **`src/modules/inventory/index.ts`** — re-exports `inventoryService`, whose `runReservationSweep()` performs the actual expiry work.
- **`src/modules/inventory/service.ts`** — implementation of `runReservationSweep()`; the sweep logic lives here.
- **`src/infrastructure/i18n/boot.ts` / `index.ts`** — `bootI18n` loads locale strings needed by the bank-transfer expiry e-mail that the cancel flow sends when the sweep (rather than a customer) triggered the expiry.

## Notes

- **Module registration is mandatory before the sweep.** The sweep emits `RESERVATION_EXPIRED`; without registered modules there is no `orders` listener to react, and the reservation row expires in the DB without downstream side-effects. The doc comment explicitly calls out the same trap guarded by `sweep-order-effects.ts`.
- **i18n is not cosmetic.** It is required so the bank-transfer cancel path can localise the "expired by sweep" e-mail. Omitting `bootI18n` would break that e-mail, not just the UI.
- **Cadence:** runs every 5 min, comfortably inside the 30-minute card-hold window and the 168-hour bank-transfer window (see `docs/reference/ops.md#scheduled-jobs`).
- **Removal ownership:** this script, the `sweep:reservations` npm script, and its `docker/crontab` line all belong to the `inventory` module and should be deleted together when that module is removed.
