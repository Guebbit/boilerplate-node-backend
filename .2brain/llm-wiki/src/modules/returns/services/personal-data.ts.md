---
source: src/modules/returns/services/personal-data.ts
generated_at: 2026-11-22T07:31:01.633068+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/personal-data.ts

## Purpose
Supplies the `returns` module's section of the `POST /account/export` personal-data export (wired up through `personalData` in `module.ts`). It collects every return belonging to an account and maps each to a safe export shape. It deliberately has no `erase` counterpart: a return is keyed by `orderId` and stores no `userId`, so there is nothing to unlink once `orders` has detached the user from the order. Returns are kept as legal and accounting records (the same Art. 17(3)(b)/(e) retention exemption `invoicing` documents).

## Key elements
- `collectPersonalData(userId)` — exported. Calls `orderService.ownOrderIds(userId)`, then `returnRepository.findByOrderIds(orderIds)`, then maps each result through `toExportReturn`. It resolves to `ExportReturn[]`.
- `toExportReturn(returned)` — module-private. Converts a `ReturnDocument` to an `ExportReturn`:
  - Always included: `id`, `orderId`, `status`, `reason` and `lines` (`productId`, `quantity`, `title`).
  - Included only when present: `note`, `declineReason`, `declineMessage` and `createdAt` (as an ISO string).
  - ObjectIds are converted to strings.

## Relationships
- `src/modules/orders/index.ts` — exposes `orderService`, whose `ownOrderIds` resolves the account's order ids. `src/modules/orders/services/index.ts` is a related neighbor in the same module.
- `src/modules/returns/repository.ts` — `returnRepository.findByOrderIds` fetches the returns for those order ids.
- `src/modules/returns/model.ts` — supplies the `ReturnDocument` type.
- `src/types/index.ts` — supplies the `ExportReturn` type.
- `src/modules/returns/module.ts` — the module definition whose `personalData` section this file serves.
- `src/modules/returns/services/index.ts` — the services barrel for the returns module.
- `src/modules/returns/tests/integration/service.test.ts`, `src/modules/delivery/tests/unit/fulfillment.test.ts` and `src/modules/payments/tests/unit/dispute-end.test.ts` — tests that are graph neighbors of this file.

## Notes
- Returns are found indirectly through the account's orders, not by user id.
- Staff-written `declineReason` and `declineMessage` are exported because the customer already receives them by mail and on their own `GET /returns`. The deciding staff member's id is never exported.
