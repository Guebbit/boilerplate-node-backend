---
source: src/modules/stock-alerts/model.ts
sha256: 4b3e0c6a82ef844bcda6b567deec529022b331815aced104decf4de64f1f1d48
generated_at: 2026-10-29T05:58:40.128728+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/model.ts

## Purpose

Defines the Mongoose schema, model, and document types for a stock-alert record — a single back-in-stock request that pairs a user with a product. The file owns the data shape and persistence indices only; all queries live in `./repository` and business rules in `./service`.

## Key elements

- **`StockAlertDocument`** — Document interface: `userId`, `productId`, `createdAt?`, `updatedAt?`.
- **`StockAlertModel`** — Typed `Model<StockAlertDocument>` alias for consumers that need the model type.
- **`stockAlertSchema`** — Mongoose schema with two required `ObjectId` fields, `timestamps: true`, a **unique compound index** on `{userId, productId}`, and a regular index on `{productId}` (for "find everyone waiting for one product" lookups).
- **`applyStockAlertTransform`** — Serialization transformer (via `applySerialization`) that maps `_id → id` and dates to ISO strings.
- **`stockAlertModel`** — The registered Mongoose model (`'StockAlert'`), ready for repository-level use.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, consumed here to build `applyStockAlertTransform`.
- **`src/modules/stock-alerts/repository.ts`** — The primary consumer of `stockAlertModel` and `StockAlertModel`; performs all reads/writes against this schema.
- **`src/modules/stock-alerts/presenter.ts`** — Applies `applyStockAlertTransform` to shape documents for presentation.
- **`src/modules/stock-alerts/index.ts`** — Barrel file; re-exports the model's public symbols to the rest of the module.
- **`src/modules/stock-alerts/tests/unit/schema-contract.test.ts`** — Asserts the schema's field types, required flags, and index definitions.
- **`src/modules/stock-alerts/tests/integration/stock-alerts.test.ts`** — Exercises the model through the repository in an integration context.
- **`tests/integration/erasure.test.ts`** — Verifies that erasing a user/product cascades through this collection's `ref` fields.

## Notes

- The unique index on `(userId, productId)` is the de-duplication mechanism: an upsert on that pair can never produce a second row. This is the only enforcement; no application-level "does it already exist?" check is needed.
- `createdAt`/`updatedAt` are typed as optional on the interface but are populated automatically by Mongoose `timestamps`. Code should treat them as present after a successful save.
- The schema intentionally carries **no** email address, status flag, or consumption timestamp — the module doc comment states the record's "life is the buyer's consent for a single mail," so it is expected to be deleted after the notification is sent.
