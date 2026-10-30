---
source: src/modules/returns/services/personal-data.ts
sha256: 80258ded6625365b7b30ee832f61c5b8293d587a82502e80bc58f755b584a40e
generated_at: 2026-10-29T05:44:14.547642+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/personal-data.ts

## Purpose

Provides the returns section of the `POST /account/export` endpoint (registered in `module.ts` as `personalData`). It retrieves and reshapes all return records belonging to a requesting user's orders into the `ExportReturn` shape. There is deliberately **no** `erase`/unlink function here: a return is keyed by `orderId` and stores no `userId`, so once `orders` breaks its own user link, the return is already unreachable. Returns are treated as legal/accounting records under Art. 17(3)(b)/(e) and are retained rather than erased.

## Key elements

- **`toExportReturn`** *(internal, not exported)* — Maps a `ReturnDocument` to the `ExportReturn` wire shape. Conditionally includes optional fields (`note`, `declineReason`, `declineMessage`, `createdAt`) to avoid null/undefined keys. Deliberately omits the deciding staff member's id.
- **`collectPersonalData(userId)`** *(exported)* — Resolves the user's order IDs via `orderService.ownOrderIds`, loads the matching returns with `returnRepository.findByOrderIds`, and maps each through `toExportReturn`. Returns `Promise<ExportReturn[]>`.

## Relationships

- **`@modules/orders`** (`src/modules/orders/index.ts`, `src/modules/orders/services/index.ts`) — Imports `orderService` solely to call `ownOrderIds(userId)`, bridging the user→order→return lookup chain.
- **`../repository`** (`src/modules/returns/repository.ts`) — Uses `returnRepository.findByOrderIds` as the data-access step.
- **`../model`** (`src/modules/returns/model.ts`) — Imports the `ReturnDocument` type used by the mapper.
- **`@types`** (`src/types/index.ts`) — Imports the `ExportReturn` type that defines the export wire shape.
- **`../services/index.ts`** — Barrel that re-exports this file's public API.
- **`../module.ts`** — Consumes `collectPersonalData` (and registers it) under the `personalData` key for the export endpoint.
- **`../tests/integration/service.test.ts`** — Integration tests exercise `collectPersonalData`.

## Notes

- **No `erase`/`unlink` export.** This is intentional, not an omission. The retention rationale (Art. 17(3)(b)/(e), same exemption `invoicing` documents) is stated in the module-level JSDoc.
- **Indirect lookup.** Returns are never queried by `userId` directly; the path is always `userId → orderIds → returns`. Any change to the order model's user linkage must keep `ownOrderIds` in sync.
- **Optional-field spreading.** The mapper uses conditional object spreads rather than defaulting to `null`, so the JSON payload contains a key only when the value is truthy.
