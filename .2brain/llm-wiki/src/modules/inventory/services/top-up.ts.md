---
source: src/modules/inventory/services/top-up.ts
source_sha256: 3c5e6994c08031f28066b44f0e1ea5b515f70cfe664668412c545f20acadfeef
context_sha256: d01dff566a037bbddd261bc307f4ffbba8caa69ff8da0b05fc2f4803dba21737
generated_at: 2026-11-22T05:23:58.551468+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/top-up.ts

## Purpose
Sets units aside again for an order whose parcel was lost. Units already left the shelf when the parcel shipped, so this reserves whatever the shelf currently has free and records the remainder as "owed", a claim on the restock that sits outside the preorder/backorder cap. It never touches units held for other orders.

## Key elements
- `reserveMoreForOrder(orderId, lines, session)` — the only export. Runs in the caller's transaction, processes lines sorted by `productId`, and returns a `TopUp[]` (per product, `shelf` and `owed` quantities). It then adds the resulting hold lines to the order's reservation. A hold that had already ended is reopened as `committed`, keeping the original payment's preorder queue position.
- `takeOne` (internal) — for one line, looks up the stock level. A missing level (deleted product) claims nothing and returns `{shelf: 0, owed: 0}`. Otherwise `shelf = min(max(available, 0), quantity)` and `owed = quantity - shelf`. It applies a `StockMovementReason.reserve` transition for the shelf part and a `StockMovementReason.owed` transition for the owed part, each with the order id as reference and a ledger note.
- `linesOf` (internal) — turns top-ups into `HoldLine[]`. Shelf units become plain stock lines and owed units become `kind: 'backorder'` lines.
- `NOTES` (internal) — the ledger note texts for the shelf part and the owed part.

## Relationships
- `./transition` (`src/modules/inventory/services/transition.ts`) — `applyTransition` performs each counter/ledger write. A falsy result is treated as a refused write and throws.
- `../repository` (`src/modules/inventory/repository.ts`) — read for the product's stock level (availability) and used to add the new lines to the order's hold.
- `../domain` (`src/modules/inventory/domain/index.ts`, `hold-lines.ts`) — supplies the `HoldLine` type.
- `./types` (`src/modules/inventory/services/types.ts`) — supplies the `StockLine` input and `TopUp` result types.
- `@types` (`src/types/index.ts`) — supplies the `StockMovementReason` enum (`reserve`, `owed`).
- `src/modules/delivery/tests/unit/fulfillment.test.ts` — related to the delivery side of lost-parcel handling; the file content shows no direct use.

## Notes
- Throws an `Error` if a counter refuses a write, or if the hold update returns falsy because the hold "moved while it was being topped up". Because everything runs in the caller's session, the caller's transaction is expected to roll these writes back.
- Products are processed in `productId` order (`localeCompare`, `'en'`) so two concurrent losses never take locks in opposite orders.
- The caller must refresh the availability entry itself after commit.
