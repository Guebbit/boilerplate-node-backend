---
source: scripts/ops/sweep-payment-effects.ts
sha256: 8dca26adde4360e416e4129cbcab36ceed32f7743e6cb29dba3fbea418b1726c
generated_at: 2026-10-14T07:28:01.558035+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-payment-effects.ts

## Purpose

Scheduled operational sweep (intended every 5 minutes) that finishes work the settlement transaction left on the provider's side: it retries every refund the provider refused (`failed`/`pending`) using the same idempotency key, and reconciles payments whose webhook never arrived by asking the provider and settling its answer. It exists because a settlement crash cannot leave the local DB half-done, but the provider-side side effects (refund acknowledgement, payment webhook) can still be outstanding.

## Key elements

- **`main`** — Chains `startJob()` → `paymentService.retryOpenRefunds()` → `paymentService.reconcileStalePayments()`, returning `undefined`. Resolves nothing back to the caller.
- **Entry-point invocation** — `void runScript('sweep:payment-effects', main, stopDatabase)` records the outcome under the `sweep:payment-effects` key for `/observability/health` and closes connections on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** — Provides `runScript`, the shared wrapper that executes `main`, reports the result to the health endpoint, and ensures `stopDatabase` runs in a `finally`-style path.
- **`src/infrastructure/config/dotenv.ts`** — Imported first (side-effect import) so environment variables are available before any other module reads config.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported before any Mongoose model loads; sets Mongoose connection defaults that are read at schema-build time.
- **`src/infrastructure/runtime/database.ts`** — Supplies `startJob` (opens the DB connection) and `stopDatabase` (closes it), bracketing the sweep's work.
- **`src/modules/payments/index.ts`** — Re-exports `paymentService`, the sole business-logic dependency of this script.
- **`src/modules/payments/services/index.ts`** — Where `paymentService` (with `retryOpenRefunds` and `reconcileStalePayments`) is actually defined; the import in this file resolves through the barrel in `index.ts` above.

## Notes

- **Import order is load-bearing.** `mongoose-boot` must precede any model import; the file's comment states the defaults are read at schema-build time, so reordering the imports can silently break connections.
- **No event/listener coupling.** Unlike `sweep-order-effects.ts`, this sweep calls the payment service directly rather than emitting a domain event, so there is no module-registration step or listener it depends on.
- **Stale-payment window** is controlled by the `NODE_PAYMENT_RECONCILE_MINUTES` env var (read from dotenv).
- **Removal is coupled.** This file, the `sweep:payment-effects` npm script, and the `docker/crontab` line must be deleted together when the payments module is removed.
- **Cadence constraint:** runs every 5 minutes, which must stay well inside the 30-minute reservation-hold window documented in `docs/reference/ops.md#scheduled-jobs`.
