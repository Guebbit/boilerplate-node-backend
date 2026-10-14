---
source: scripts/ops/reap-orders.ts
sha256: ec669e57f10dcf0f21b2284e75b159939daaaad20b5f862f7a3709a2771f7354
generated_at: 2026-10-14T07:24:52.709683+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-orders.ts

## Purpose

Periodic cron script (`npm run reap:orders`) that scrubs PII from order documents once they pass their retention window. It never deletes an order row — the order survives as a revenue record — but replaces the customer email, unsets addresses and notes, and separately scrubs staff-written timeline text that has aged past its own clock.

## Key elements

- **`main`** — chains `startJob()` → `orderService.anonymizeDueOrders()` → `orderService.scrubTimelineText()`, resolving to `void`.
- **Entry-point call** — `void runScript('reap:orders', main, stopDatabase)` wires the script into the shared observability/health reporting and guarantees DB cleanup on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** — provides `runScript`, which runs `main`, records the outcome under the `reap:orders` health key, and invokes `stopDatabase` on completion.
- **`src/infrastructure/config/dotenv.ts`** — imported first; populates `NODE_ORDER_PII_RETENTION_DAYS` and `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS` before any model is built.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — imported second (before any Mongoose model loads) to set connection-level defaults that are read at schema-build time.
- **`src/infrastructure/runtime/database.ts`** — supplies `startJob` (connection setup) and `stopDatabase` (teardown passed to `runScript`).
- **`src/modules/orders/index.ts`** — re-exports `orderService`, the entry point the script calls.
- **`src/modules/orders/services/index.ts`** — where `anonymizeDueOrders()` and `scrubTimelineText()` are actually implemented.

## Notes

- **Import order matters:** `dotenv` must load before `mongoose-boot`, and `mongoose-boot` before any model, because Mongoose connection options are captured at schema-build time.
- **Paired with a reactive hook:** the `personalData.erase` hook in `orders/module.ts` stamps `anonymizeAfter` the moment an account is erased. This script is the *sweep* half; the hook is the *trigger* half. An order already past its window is due almost immediately — the hook does not grant a fresh retention period.
- **Two independent clocks:** order PII uses `anonymizeAfter` (set at erasure); timeline text uses its own row timestamp, so a live (non-erased) customer's timeline text still gets scrubbed once it ages past `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS`.
- **Cron, not boot:** intended to run in the same cron container as other `reap:*` scripts, never on every service start.
- **Removal is coupled:** deleting this script also requires removing the `reap:orders` npm script entry and its `docker/crontab` line, since all three are owned by the `orders` module.
