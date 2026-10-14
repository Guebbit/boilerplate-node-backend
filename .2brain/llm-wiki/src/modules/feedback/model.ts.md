---
source: src/modules/feedback/model.ts
sha256: 572cf2b3d1ef9c468eb6d8298264db486a17ae961259e348465341fbe994156b
generated_at: 2026-10-14T15:49:49.279302+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/model.ts

## Purpose

Defines the Mongoose schema, model, and serialization transform for the `FeedbackRequest` collection. It is the single persistence-layer entry point for feedback tickets: field definitions, index creation, TTL expiry, and the `_id`/`__v` normalization that turns stored documents into wire-shaped API objects.

## Key elements

- **`FeedbackRequestDocument`** – Mongoose document interface; overrides `respondedAt`/`createdAt`/`updatedAt` from `string` (API type) to `Date` (Mongoose-native).
- **`FeedbackRequestModel`** – Type alias for `Model<FeedbackRequestDocument>`.
- **`feedbackRequestSchema`** – Schema with fields `name`, `email`, `subject`, `message`, `status` (enum, default `new`), `adminNotes`, `respondedAt`; `timestamps: true` for auto-managed `createdAt`/`updatedAt`.
- **Compound index** `{ status: 1, createdAt: -1 }` – Serves the admin list's "filter by status, sort newest-first" query.
- **TTL index** `{ createdAt: 1 }` with `expireAfterSeconds` derived from `NODE_FEEDBACK_RETENTION_DAYS` (default 730 / 24 months).
- **`applyFeedbackRequestTransform`** – Serialization function (via `applySerialization`) that maps `_id → id` and strips `__v`. Exported so lean query results (which skip `toJSON`) can be normalized in `./service`.
- **`feedbackRequestModel`** – The registered Mongoose model (`model('FeedbackRequest', …)`).

## Relationships

- **`src/types/index.ts`** – Imports the `FeedbackRequestStatus` enum and `FeedbackRequest` interface used to type the schema and document.
- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, which this file calls to produce `applyFeedbackRequestTransform`.
- **`src/modules/feedback/config.ts`** – Provides `feedbackConfig()` to read `NODE_FEEDBACK_RETENTION_DAYS` at import time for the TTL index.
- **`src/modules/feedback/service.ts`** – Consumes `applyFeedbackRequestTransform` to normalize lean query results (see `search()`).
- **`src/modules/feedback/repository.ts`** – Consumes `feedbackRequestModel` for CRUD operations.
- **`src/modules/feedback/presenter.ts`** – Consumes the document/model types for shaping responses.
- **`src/modules/feedback/index.ts`** – Barrel file that re-exports this module's public API.
- **`src/modules/feedback/tests/unit/schema-contract.test.ts`** – Validates the schema's field types, required constraints, and enum values.

## Notes

- **No index on `email` is intentional.** The only email query is case-insensitive and unanchored; a B-tree index cannot serve it, so an index would add write cost with no read benefit.
- **TTL index is a separate single-field ascending index.** Mongoose/Mongo only honours `expireAfterSeconds` on a single-field ascending index; attaching it to the compound `{ status: 1, createdAt: -1 }` would silently never expire documents.
- **Changing `NODE_FEEDBACK_RETENTION_DAYS` does not take effect on a plain restart.** Mongo refuses to modify an existing TTL index's `expireAfterSeconds` in place, so boot fails with `autoIndex`. Run `npm run db:sync` to drop and rebuild the index. The same caveat applies to `audit-logs/model.ts`.
- **Date fields are `Date` in Mongo, `string` on the wire.** The API-generated `FeedbackRequest` type uses ISO strings; this module overrides them to `Date` for Mongoose, and `applyFeedbackRequestTransform` (or `toJSON`) narrows them back.
