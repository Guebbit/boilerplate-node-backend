---
source: scripts/ops/sweep-reservations.ts
sha256: 7a98ce7a6cce2c249f0b099ef52c4f8ab90abf596c203577230591c09cf953ab
generated_at: 2026-10-14T07:28:44.490238+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-reservations.ts

## Purpose

Scheduled job (every 5 min, via `npm run sweep:reservations` and a crontab entry) that expires stale reservation holds so abandoned checkouts release their inventory units. It delegates the actual sweep to the inventory module, then settles the outbox so the `orders` module hears each `RESERVATION_EXPIRED` announcement before the process exits.

## Key elements

- **`LEASE_TTL_MS`** – 10-minute constant; upper bound on how long a crashed holder blocks the next run.
- **`main`** – Orchestrates the full lifecycle: `startJob` → `registerModules` + `bootI18n` → `withLease` wrapping `inventoryService.runReservationSweep()` and `settleOutboxNudges()`.
- **Entry-point invocation** – `runScript(undefined, main, teardown)`; teardown closes the database and queue connections on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** – Provides `runScript`, the wrapper that handles process-level bookkeeping and teardown. This file passes `undefined` as the job name (see Notes).
- **`src/infrastructure/persistence/lease.ts`** – `withLease` provides mutual exclusion; returns `undefined` when another holder already owns the lease, causing a skip.
- **`src/kernel/registry.ts`** – `registerModules` installs event listeners (notably `orders` listening for `RESERVATION_EXPIRED`) before the sweep fires.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes the outbox inside the lease so all expiry events are delivered before connections close.
- **`src/modules/inventory/index.ts`** / **`src/modules/inventory/services/index.ts`** – `inventoryService.runReservationSweep()` performs the actual per-hold expiry logic.
- **`src/modules.ts`** – Supplies `enabledModules` and `enabledModuleDirectories('locales')` for registration and i18n boot.
- **`src/infrastructure/i18n/index.ts`** (`bootI18n`) – Loads locale strings needed if the expiry triggers the bank-transfer cancellation email.
- **`src/infrastructure/runtime/database.ts`** – `startJob` opens the connection; `stopDatabase` in teardown closes it.
- **`src/infrastructure/runtime/mongoose-boot.ts`** – Side-effect import that sets Mongoose defaults before any schema is built.
- **`src/infrastructure/config/dotenv.ts`** – Side-effect import; loads environment variables first.
- **`src/infrastructure/adapters/queue.ts`** – `stopQueue` in teardown.
- **`src/infrastructure/adapters/logger.ts`** – `logger.info` for the "lease held, skipped" message.

## Notes

- **Import order is load-bearing.** `dotenv` and `mongoose-boot` must come before any model/schema code; Mongoose defaults are read at schema-build time.
- **`registerModules` before the sweep.** Without it, `RESERVATION_EXPIRED` is announced into a void (no `orders` listener). Same failure mode guarded by `sweep-order-effects.ts`.
- **`settleOutboxNudges` is inside the lease.** Ensures every event is delivered before `stopDatabase`/`stopQueue` run.
- **`runScript` receives `undefined` as the job name.** The lease already records this job's outcome under `'sweep:reservations'`. Passing a name here would record a second, always-success entry, masking a skipped run.
- **Removal is owned by the `inventory` module.** Deleting the module removes this script, the `sweep:reservations` npm script, and the corresponding `docker/crontab` line together.
