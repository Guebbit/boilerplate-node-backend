# src/modules/feedback/model.ts

## Purpose

Defines the Mongoose schema, document type, and model for the `FeedbackRequest` collection. It bridges the API-generated TypeScript type (which uses ISO strings for timestamps) and Mongoose's native `Date` storage, and exposes a serialization transform so lean query results can be shaped identically to hydrated documents.

## Key elements

- **`FeedbackRequestDocument`** – Mongoose document interface; overrides `respondedAt`, `createdAt`, `updatedAt` from `string` to `Date` (and adds Mongoose's `Document`).
- **`FeedbackRequestModel`** – Convenience type alias: `Model<FeedbackRequestDocument>`.
- **`feedbackRequestSchema`** – The schema definition (fields, required/optional, `status` enum defaulting to `new`, `timestamps: true`). Registers a single compound index `{ status: 1, createdAt: -1 }`.
- **`applyFeedbackRequestTransform`** – A function (derived via `applySerialization`) that normalizes a lean/serialized doc: maps `_id → id` and strips `__v`. Exported so the service can apply it to lean query results without `toJSON`.
- **`feedbackRequestModel`** – The registered Mongoose model instance; the primary import target for repositories and services.

## Relationships

- **`src/types/index.ts`** – Provides the `FeedbackRequest` type and `FeedbackRequestStatus` enum consumed here.
- **`src/infrastructure/persistence/serialize.ts`** – Supplies `applySerialization`, which is called on the schema to produce `applyFeedbackRequestTransform`.
- **`src/modules/feedback/service.ts`** – Imports `applyFeedbackRequestTransform` to shape lean results in `search()`.
- **`src/modules/feedback/repository.ts`** – Imports `feedbackRequestModel` to run queries against the collection.
- **`src/modules/feedback/tests/unit/schema-contract.test.ts`** – Asserts the schema's field/enum/index contract.
- **`src/modules/feedback/tests/integration/service.test.ts`** – Exercises the service (and thus the model) against a real or mocked Mongo.

## Notes

- **No index on `email`** — intentional. The only email query is case-insensitive and unanchored (regex), which a B-tree index cannot serve; adding one would only add write cost.
- **Timestamps are `Date` in the model, `string` on the wire.** The `applySerialization`-based transform handles the conversion; do not expect ISO strings on raw Mongoose documents.
- The `id` field on the wire is derived from `_id` via the transform; there is no separate `id` column in the schema.
