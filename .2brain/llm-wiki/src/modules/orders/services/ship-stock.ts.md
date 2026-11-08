---
source: src/modules/orders/services/ship-stock.ts
sha256: 89098269a00e0f026f69cee6b2017ce995741221bc1ab85de3479ed6f28e36bc
generated_at: 2026-11-08T07:00:56.559769+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/ship-stock.ts

## Purpose

Provides the stock-release step for **status overrides** (shipped/delivered) that ship the entire remaining held quantity of an order in one go. It is the whole-remainder counterpart to the per-shipment `shipStock` in `./fulfillment`. Its reason for existence is to guarantee that an order never reads `shipped` while its units still count as on-hand: the status write and the stock decrement are committed atomically.

## Key elements

- **`announceMoveShippingStock(orderId, write, announce)`** — The sole export. Inside a single Mongoose transaction it (1) runs the caller-supplied conditional `write`, (2) if a document is returned, calls `inventoryService.shipForOrder` to decrement shelf stock, and (3) emits domain events via `announceInTransaction`. After the commit lands (outside the transaction) it calls `inventoryService.refreshStockCacheForOrder` because the catalogue stock cache cannot participate in the rollback. Returns the updated `OrderDocument`, or `null` when the conditional write matched nothing (lost race) and no stock moved.

## Relationships

- **`src/kernel/outbox.ts`** — Supplies `announceInTransaction` (the transaction + outbox envelope) and the `OutboxAnnouncements<DomainEventName>` type that shapes the `announce` parameter.
- **`src/kernel/events.ts`** — Source of the `DomainEventName` type used in the `announce` callback signature.
- **`src/modules/inventory/index.ts`** — Re-exports `inventoryService`, whose `shipForOrder` and `refreshStockCacheForOrder` methods perform the actual stock mutation and cache refresh.
- **`src/modules/inventory/services/index.ts`** — Implementation layer behind `inventoryService` (the two methods called above).
- **`src/modules/orders/model.ts`** — Defines `OrderDocument`, the type threaded through `write` and `announce`.
- **`src/modules/orders/services/override.ts`** — The caller that supplies the `write` and `announce` callbacks for a whole-remainder status transition; this file is its stock side.

## Notes

- **Stock moves at ship, not at payment.** The shelf count drops when goods leave, consistent with Shopify, Magento MSI, Saleor, and Medusa conventions.
- **Cache refresh is post-commit.** `refreshStockCacheForOrder` runs *after* the transaction resolves. If it fails, the DB is correct but the in-memory/CDN cache is stale until the next refresh cycle.
- **`write` returning `null` is a normal path.** It signals a lost optimistic race (e.g., two concurrent overrides); no stock is moved and no event is emitted.
- **Not for per-shipment fulfilment.** Ordinary line-by-line shipments go through `./fulfillment`'s `shipStock`. Using this function for a partial shipment would release the entire remaining hold.
