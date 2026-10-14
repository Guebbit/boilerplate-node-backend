---
source: src/modules/inventory/services/allocate.ts
sha256: 1a75a98666dc9a9089da30e2a608298a0667ad0ae6956e56bdc054ff4affccf6
generated_at: 2026-10-14T15:57:14.692898+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/allocate.ts

## Purpose

Allocates arrived stock to paid preorders (oldest payment first) inside the receipt's own transaction, so allocated units never appear sellable to other buyers in the gap between arriving and being claimed. Converts a paid preorder's claim (`preorder` kind) into a real hold (`stock` kind) on concrete shelf units, decrementing `available` while leaving the shelf count untouched.

## Key elements

- **`Allocation`** (interface) — one order's slice of an allocation: `orderId`, `productId`, `quantity` allocated, and `waiting` still outstanding (0 = fully served).
- **`withAllocated`** (internal) — rebuilds a hold's `StockLine[]` by splitting a given product's `preorder` line into `stock` + any remaining `preorder`, while preserving other product lines unchanged.
- **`allocateProduct`** (internal) — reads the stock level, walks paid preorder holds in queue order, and for each: computes how many units to hand over, calls `applyTransition` to move counters, rewrites the hold's items via `replaceItems`, and records the `Allocation`. Throws if the counter transition is refused.
- **`allocateWithin`** (export) — public entry point. Deduplicates `productIds`, calls `allocateProduct` sequentially per product (session constraint), then enqueues one `PREORDER_ALLOCATED` outbox event per served order/product pair. Returns the full `Allocation[]`.

## Relationships

- **`@kernel/outbox`** (`enqueueOutboxEvent`) — emits `PREORDER_ALLOCATED` events, scoped to the order ID, within the caller's session.
- **`../repository`** (`reservationRepository`, `stockLevelRepository`) — reads stock levels and paid preorder holds; writes updated item lists back to reservations.
- **`../model`** (`ReservationDocument`) — the shape of a paid hold whose items are read and rewritten.
- **`../events`** (`PREORDER_ALLOCATED`) — the event name passed to the outbox.
- **`./transition`** (`applyTransition`) — performs the actual `StockMovementReason.allocate` counter movement; must succeed or the allocation aborts.
- **`./types`** (`StockLine`) — the item-line type used when reconstructing hold items.
- **`@types`** (`StockMovementReason`) — supplies the `allocate` reason enum value.

## Notes

- **Caller owns the transaction.** The Mongoose `ClientSession` is passed in; this file never creates or commits one. It is designed to run *inside* the receipt flow.
- **Sequential by product.** Products are processed one after another because a single session does not support parallel operations (explicitly noted in the code comment).
- **Two line kinds, same product.** After allocation a hold may carry both a `preorder` and a `stock` line for the same `productId`. Downstream ship/release logic must distinguish by `kind`.
- **`waiting` semantics.** `waiting` in the returned `Allocation` is the *remainder* after this pass, not the original demand. A value of 0 means the order is fully served.
- **Hard failure on counter refusal.** If `applyTransition` returns falsy, the function throws immediately rather than skipping — the transaction is expected to roll back.
