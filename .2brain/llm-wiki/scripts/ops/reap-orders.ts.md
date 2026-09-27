---
source: scripts/ops/reap-orders.ts
sha256: a895cb512aade1c8a4bc161cadcf370705e1651450c4564d96b6d69f1b32a3bf
generated_at: 2026-09-27T13:57:42.931916+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-orders.ts

## Purpose

Periodic operational script (`npm run reap:orders`) that anonymizes order PII once its retention window has elapsed. It never deletes a row — an order is treated as an invoice and kept whole under Art. 17(3)(b)/(e). It complements the `personalData.erase` hook in the orders module (which unsets `userId` and stamps `anonymizeAfter`); this script performs the second step of replacing remaining PII fields with placeholders.

## Key elements

- **`main`** – Top-level promise chain: `start()` → `orderService.anonymizeDueOrders()` → resolves `void`. No result is returned to the caller.
- **`runScript('reap:orders', main, stopDatabase)`** – Registers the script under its npm label and wires `stopDatabase` as the teardown/cleanup callback. The `void` keyword discards the returned promise (fire-and-forget entry point).
- **`orderService.anonymizeDueOrders()`** (imported from `@modules/orders`) – The single business call; replaces email, shipping name/phone/street, and notes with placeholders while preserving amounts, line items, dates, city, and country.

## Relationships

- **`scripts/run-script.ts`** — Provides the `runScript` helper that binds a script name, the main function, and a cleanup callback into the project's standard CLI lifecycle.
- **`src/infrastructure/runtime/database.ts`** — Supplies `start()` (connection bootstrap) and `stopDatabase` (graceful teardown), giving this script DB access without owning a connection pool.
- **`src/modules/orders/index.ts`** — Re-exports `orderService`, the service through which this script reaches order-domain logic.
- **`src/modules/orders/services/index.ts`** — Origin of the `anonymizeDueOrders` method actually executed here.

## Notes

- **Never deletes rows.** The script only overwrites PII columns; the order record persists. This is a deliberate legal design (invoice retention), not an oversight.
- **Retention clock starts at account-erase time, not order-creation time.** The `anonymizeAfter` date is computed as `max(now, createdAt + NODE_ORDER_PII_RETENTION_DAYS)` by the erase hook. If the order was already past its own window at erase time, `anonymizeDueOrders` will pick it up almost immediately.
- **Runs in the cron container** alongside other `reap:*` scripts. It must not be invoked on application boot.
- **Removal ownership:** If the orders module is removed, delete this file, the `reap:orders` npm script, and its `docker/crontab` line together.
