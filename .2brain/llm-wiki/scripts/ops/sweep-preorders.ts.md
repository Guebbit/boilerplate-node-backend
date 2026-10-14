---
source: scripts/ops/sweep-preorders.ts
sha256: 0eb76dda3cdfe40d86e532f3bf356c75d9caba76bf69537318727c0478477d46
generated_at: 2026-10-14T07:28:22.593812+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-preorders.ts

## Purpose

Daily scheduled job (`npm run sweep:preorders`) that fulfills the buyer-notice and 30-day-silence obligations that attach to every active preorder. It asks buyers whose expected delivery date has passed whether they still want to wait, and flags 30-day silent waits so the `returns` module can cancel and refund. It is a job rather than an admin task because both actions are legal duties (FTC 16 CFR 435.2, CRD Art. 18).

## Key elements

- **`LEASE_TTL_MS`** – 30-minute lease TTL; bounds how long a crashed holder blocks the next run.
- **`main`** – Orchestrates one pass: `startJob` → `registerModules` → `bootI18n` → `withLease('sweep:preorders', …)` → `runPreorderSweep()` → `settleOutboxNudges()`. Logs completion or a skip-if-lease-held message.
- **Entry-point call** – `void runScript(undefined, main, cleanup)` wires the script into the shared lifecycle helper; `undefined` for the job name means the lease key `sweep:preorders` is the sole identity.

## Relationships

- **`scripts/run-script.ts`** – Provides `runScript`, which wraps `main` with a unified cleanup path (`stopDatabase` + `stopQueue`) on both success and failure.
- **`src/infrastructure/config/dotenv.ts`** – Imported first (side-effect) so environment variables are available before anything else loads.
- **`src/infrastructure/runtime/mongoose-boot.ts`** – Imported second (side-effect); Mongoose defaults must be set before any schema is built.
- **`src/infrastructure/runtime/database.ts`** – `startJob` opens the connection; `stopDatabase` closes it in cleanup.
- **`src/infrastructure/adapters/queue.ts`** – `stopQueue` closes the queue in cleanup.
- **`src/kernel/registry.ts`** – `registerModules` installs event subscriptions so outbox events reach `notifications` and `returns`.
- **`src/modules.ts`** – Supplies `enabledModules` and `enabledModuleDirectories('locales')` for registration and i18n.
- **`src/infrastructure/i18n/index.ts` / `boot.ts`** – `bootI18n` loads locale data for the buyer notice emails.
- **`src/infrastructure/persistence/lease.ts`** – `withLease` guarantees single-holder execution; returns `undefined` when the lease is already held.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes pending outbox entries (buyer notices, expiry events) before connections close.
- **`src/modules/delivery/index.ts`** – Re-exports `runPreorderSweep`.
- **`src/modules/delivery/services/preorder-sweep.ts`** – Contains the actual sweep logic that identifies eligible preorders and emits outbox events.
- **`src/infrastructure/adapters/logger.ts`** – Logs sweep results and skip messages.

## Notes

- **Import order is load-bearing.** `dotenv` and `mongoose-boot` must precede any module that touches Mongoose; `registerModules` must precede `runPreorderSweep` so outbox subscribers are wired before events are emitted.
- **`settleOutboxNudges` runs inside the lease.** This guarantees `notifications` and `returns` have received every event before the DB/queue connections are torn down.
- **Idempotent by design.** A previously noticed date is not noticed again; an expired wait stays expired until its cancel lands. Safe to re-run manually.
- **Ownership.** The file, the `sweep:preorders` npm script, and its `docker/crontab` entry are all removed together when the `delivery` module is removed.
