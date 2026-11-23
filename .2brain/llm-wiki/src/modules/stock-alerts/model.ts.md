---
source: src/modules/stock-alerts/model.ts
source_sha256: 7ff94165b155f1aca9e6a0f17b67a3c60da5e0d3074bfe8a14677e1b5dcdd261
context_sha256: 71885c9489d89a62b55ddadc60937cf04d232fea7a3cea957da4bb634cebb61b
generated_at: 2026-11-22T07:54:37.156415+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/model.ts

## Purpose
Defines the Mongoose model for a back-in-stock request: one row per user and product, representing the buyer's consent for a single notification mail. It stores only who asked (`userId`), about what (`productId`), and when (timestamps).

## Key elements
- `StockAlertDocument` — document interface with `userId` and `productId` (`ObjectId`s) plus optional `createdAt`/`updatedAt`.
- `StockAlertModel` — `Model<StockAlertDocument>` type alias. Queries live in `./repository`, business rules in `./service`.
- `stockAlertSchema` — schema with required `userId` (ref `User`) and `productId` (ref `Product`), with `timestamps: true`.
- Indexes:
  - Unique compound `{ userId: 1, productId: 1 }`, so an upsert on the pair cannot create a duplicate request.
  - Non-unique `{ productId: 1 }`, for finding everyone waiting on one product.
- `applyStockAlertTransform` — result of `applySerialization(stockAlertSchema)`; maps `_id` to `id` and dates to ISO strings.
- `stockAlertModel` — the registered `'StockAlert'` model, the module's entry point to the collection.

## Relationships
- `src/infrastructure/persistence/serialize.ts` — supplies `applySerialization`, used to build `applyStockAlertTransform`.
- `src/modules/stock-alerts/repository.ts` — holds the queries against this model (per the type's doc comment).
- `src/modules/stock-alerts/index.ts` and `src/modules/stock-alerts/presenter.ts` — sibling module files in the dependency graph. Their exact use of the exports isn't visible from this file.
- `src/modules/stock-alerts/tests/integration/stock-alerts.test.ts`, `src/modules/stock-alerts/tests/unit/schema-contract.test.ts` and `tests/integration/erasure.test.ts` — tests related to this model in the graph. The schema-contract test presumably covers the shape defined here.

## Notes
- The unique index is what enforces "asking twice is the same request". Dedup depends on it, not on application code in this file.
- The model deliberately holds no data beyond user, product and timestamps.
- `applyStockAlertTransform` is exported rather than applied implicitly. Check how callers use it before relying on serialized output.
