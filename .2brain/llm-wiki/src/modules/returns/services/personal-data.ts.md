---
source: src/modules/returns/services/personal-data.ts
sha256: 80258ded6625365b7b30ee832f61c5b8293d587a82502e80bc58f755b584a40e
generated_at: 2026-11-08T08:05:10.580900+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/personal-data.ts

## Purpose

Provides the `personalData` contribution for the returns module in the `POST /account/export` GDPR data-export flow. It collects every return linked to a user's orders and shapes them into a customer-facing export record. There is intentionally no `erase` function here: a return is keyed by `orderId` (not `userId`), so once `orders` runs its own `detachUserId`, the link is already broken. Returns are legal/accounting records of a consumer-rights act, falling under the Art. 17(3)(b)/(e) retention exemption (same rationale as `invoicing`).

## Key elements

- **`collectPersonalData(userId)`** — Exposed as the module's `personalData` entry point. Calls `orderService.ownOrderIds(userId)` to resolve the user's order ids, then `returnRepository.findByOrderIds(orderIds)` to fetch returns, and maps each through the internal shaper. Returns `Promise<ExportReturn[]>`.
- **`toExportReturn(returned)`** — Internal (non-exported) mapper from a `ReturnDocument` to the `ExportReturn` wire shape. Emits `id`, `orderId`, `status`, `reason`, `lines` (productId / quantity / title), and conditionally includes `note`, `declineReason`, `declineMessage`, `createdAt`. Deliberately omits the deciding staff member's id.

## Relationships

- **`src/modules/orders/index.ts`** — Imports `orderService` and calls `ownOrderIds(userId)` to obtain the list of order ids belonging to the requesting account.
- **`src/modules/returns/repository.ts`** — Imports `returnRepository` and calls `findByOrderIds(orderIds)` to load the return documents.
- **`src/modules/returns/model.ts`** — Imports the `ReturnDocument` type used as the input to `toExportReturn`.
- **`src/types/index.ts`** — Imports the `ExportReturn` type that defines the output shape of the export.
- **`src/modules/returns/module.ts`** — Registers this file's `personalData` export as the returns section of the composite `POST /account/export` response.
- **`src/modules/returns/services/index.ts`** — Barrel re-export surface for this module.

## Notes

- The absence of an `erase` export is deliberate, not an oversight. Do not add one; the unlinking responsibility lives in `orders` (`detachUserId`).
- `toExportReturn` uses conditional spread (`...(cond ? { key: val } : {})`) to keep optional fields out of the JSON entirely rather than emitting `null`/`undefined`.
- The doc-comment on the module explicitly states that `declineReason`/`declineMessage` are shown to the customer on their own `GET /returns` endpoint, so they are in-scope for export.
