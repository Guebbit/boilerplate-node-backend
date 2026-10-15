---
source: src/modules/returns/services/personal-data.ts
sha256: e0f03afe4ef0267a5f62981ddd9c88f9c5e2ca2336ed45cde5eb155ea91aabe4
generated_at: 2026-10-15T11:57:43.044182+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/personal-data.ts

## Purpose

Implements the returns module's contribution to the `POST /account/export` endpoint (registered as `personalData` in `module.ts`). Given a user ID, it resolves the user's order IDs, fetches all associated returns, and shapes them into the `ExportReturn` export format. It intentionally has no `erase` counterpart: a return is keyed by `orderId` and stores no `userId`, so once the orders module detaches the user link, no further unlinking is needed here.

## Key elements

- **`collectPersonalData(userId: string): Promise<ExportReturn[]>`** — exported entry point. Calls `ownOrderIds(userId)` to get the account's order IDs, then `returnRepository.findByOrderIds(orderIds)`, and maps each `ReturnDocument` through `toExportReturn`.
- **`toExportReturn(returned: ReturnDocument): ExportReturn`** — internal mapper. Selects `id`, `orderId`, `status`, `reason`, line items (`productId`, `quantity`, `title`), and conditionally includes `note`, `declineReason`, and `createdAt`. Deliberately omits any staff-member identifier.

## Relationships

- **`src/modules/orders/index.ts`** — imports `ownOrderIds`, which resolves a user's own order IDs (implemented in the orders module's read service). This is the sole mechanism for associating returns with a user.
- **`src/modules/returns/repository.ts`** — imports `returnRepository` and calls `findByOrderIds` to load return documents.
- **`src/modules/returns/model.ts`** — imports the `ReturnDocument` type used as the input to `toExportReturn`.
- **`src/types/index.ts`** — imports the `ExportReturn` type that defines the export shape.
- **`src/modules/returns/module.ts`** — wires `collectPersonalData` as the `personalData` section for the account-export endpoint.
- **`src/modules/returns/services/index.ts`** — barrel file that re-exports `collectPersonalData`.
- **`src/modules/returns/tests/integration/service.test.ts`** — integration tests exercise `collectPersonalData` end-to-end against the repository.

## Notes

- **No erase/unlink exists by design.** Returns are an accounting/legal record of a consumer-rights act (Art. 17(3)(b)/(e) GDPR retention exemption, same rationale as the `invoicing` module documents). There is no `userId` column to scrub.
- **`declineReason` is included in exports** because it is customer-facing content (mailed to the customer, visible on their `GET /returns`), not an internal-only field.
- **Optional fields** (`note`, `declineReason`, `createdAt`) are spread conditionally (`...(x ? {…} : {})`) so the export JSON omits them entirely rather than emitting `null`/`undefined` keys.
- **`toExportReturn` is not exported**; it is a pure mapping helper scoped to this file.
