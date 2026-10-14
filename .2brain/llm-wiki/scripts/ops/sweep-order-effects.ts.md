---
source: scripts/ops/sweep-order-effects.ts
sha256: ad9640f404b55f5bdb090af35aa0791e9af93d31489673c78f2eafce7aeeafa0
generated_at: 2026-10-14T07:27:27.695215+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-order-effects.ts

## Purpose

Operational sweep script (`npm run sweep:order-effects`) that re-emits `ORDER_REFUND_OWED` for cancelled orders whose refund was never processed. The domain event bus has no built-in retry, so if the `payments` provider was unreachable during the original cancel, the refund is silently lost. This script retries only the money half; it does **not** retry stock/release effects. Intended to run every 5 minutes via cron, matching the `NODE_ORDER_EFFECT_RETRY_MINUTES` grace window.

## Key elements

- **`main`** – Sequential async chain: `startJob()` → `registerModules(enabledModules)` → `orderService.retryPendingEffects()`. Resolves to `void`; never rejects (errors are caught by the `runScript` wrapper).
- **`registerModules(enabledModules)`** – Wires up event-bus listeners (notably the `payments` subscriber) so the emitted `ORDER_REFUND_OWED` is actually received and acted upon. Without this call the sweep would clear every marker without refunding anything.
- **`runScript('sweep:order-effects', main, stopDatabase)`** – Entry-point wrapper that records the job outcome under the `sweep:order-effects` key for `/observability/health` and ensures `stopDatabase` runs on both success and failure paths.
- **Import ordering** – `dotenv` first, then `mongoose-boot` (Mongoose defaults are read at schema-build time), then `database`, `registry`, `modules`, and `orderService`.

## Relationships

- **`scripts/run-script.ts`** – Provides the `runScript` lifecycle wrapper (health reporting + cleanup) used as the script's entry point.
- **`src/infrastructure/config/dotenv.ts`** – Side-effect import that loads environment variables before any other module reads config.
- **`src/infrastructure/runtime/mongoose-boot.ts`** – Side-effect import that configures Mongoose connection defaults; must precede any model/schema load.
- **`src/infrastructure/runtime/database.ts`** – Exports `startJob` (opens the connection) and `stopDatabase` (closes it, passed as the cleanup callback to `runScript`).
- **`src/kernel/registry.ts`** – Exports `registerModules`, which installs event-bus subscriptions so `payments` can listen for `ORDER_REFUND_OWED`.
- **`src/modules.ts`** – Exports `enabledModules`, the list passed to `registerModules`.
- **`src/modules/orders/index.ts`** – Re-exports `orderService`.
- **`src/modules/orders/services/index.ts`** – Defines `orderService.retryPendingEffects()`, the single business operation this script invokes.

## Notes

- **Module registration is mandatory, not optional.** Unlike other `reap:*` scripts that can skip it, this sweep depends on a live `payments` listener. Omitting `registerModules` makes the sweep a no-op that still clears the pending markers.
- **Idempotency** relies on `payments` performing a conditional refund; a second pass over an already-settled order is a safe no-op.
- **Coverage gap (by design):** This script does not retry stock/release effects. A `committed` hold that was released by a cancel (and then the release threw) is also invisible to `sweep:reservations` (which only matches `held` holds). Those units remain lost from sale; see the module doc-comment for the full rationale.
- **Removal:** Owned by the `orders` module. Delete alongside the `sweep:order-effects` npm script and its `docker/crontab` entry when the module is removed.
