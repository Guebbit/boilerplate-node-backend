---
source: src/modules/stock-alerts/model.ts
sha256: 4b3e0c6a82ef844bcda6b567deec529022b331815aced104decf4de64f1f1d48
generated_at: 2026-11-08T08:28:34.710268+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/model.ts

## Purpose

Defines the Mongoose model for a back-in-stock request — a single, one-shot consent record linking a user to a product for exactly one notification email. It contains the document shape, schema, indexes, serialization transform, and the model instance consumed by the rest of the stock-alerts module.

## Key elements

- **`StockAlertDocument`** – Mongoose `Document` interface: `userId` (ObjectId → User), `productId` (ObjectId → Product), `createdAt`/`updatedAt`.
- **`StockAlertModel`** – Type alias for `Model<StockAlertDocument>`; used as the static type on the model instance.
- **`stockAlertSchema`** – Mongoose schema with two required ObjectId refs, `timestamps: true`, a **unique compound index** on `(userId, productId)`, and a **single-field index** on `productId`.
- **`applyStockAlertTransform`** – Serialization transform (maps `_id` → `id`, dates → ISO strings) built via `applySerialization`.
- **`stockAlertModel`** – The registered Mongoose model (`'StockAlert'`); the entrypoint other modules import.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Imports `applySerialization` to construct `applyStockAlertTransform`.
- **`src/modules/stock-alerts/repository.ts`** – Consumes `stockAlertModel` for all queries and upserts (noted in the file's own comment: *"Queries live in `./repository`"*).
- **`src/modules/stock-alerts/index.ts`** – Module barrel; re-exports this model for external consumers.
- **`src/modules/stock-alerts/presenter.ts`** – Maps persisted documents (via the transform) into outbound payloads.
- **`src/modules/stock-alerts/tests/unit/schema-contract.test.ts`** – Validates the schema shape and indexes against a contract.
- **`src/modules/stock-alerts/tests/integration/stock-alerts.test.ts`** – Exercises the model end-to-end against a test database.
- **`tests/integration/erasure.test.ts`** – Verifies that erasing user data removes stock-alert documents through this model.

## Notes

- The **unique compound index** on `(userId, productId)` is the natural key: an upsert on that pair can never create a duplicate row. There is no separate "id" or "request number" field.
- The single-field `productId` index exists specifically so a stock-restored signal can fan out to every user waiting on that product.
- The model is intentionally minimal — no email address, no status field, no "consumed" flag. The file docblock states the record's entire life is the consent for one mail; removal (deletion) is the terminal state.
