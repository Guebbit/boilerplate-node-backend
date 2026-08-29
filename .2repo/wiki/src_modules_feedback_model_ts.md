# src/modules/feedback/model.ts

## Purpose
Defines the Mongoose schema, document type, and model for the `FeedbackRequest` collection. It exists to bridge the API-generated `FeedbackRequest` type (string dates) with MongoDB's native `Date` handling and to centralize the serialization transform used whenever feedback records are returned to callers.

## Key elements

- **`FeedbackRequestDocument`** – Interface extending `Omit<FeedbackRequest, …>` with `Date`-typed `respondedAt`/`createdAt`/`updatedAt`, plus Mongoose `Document`.
- **`FeedbackRequestModel`** – Type alias: `Model<FeedbackRequestDocument>`.
- **`feedbackRequestSchema`** – Mongoose `Schema` with fields `name`, `email` (required), `subject` (required), `message` (required), `status` (enum of `FeedbackRequestStatus`, defaults to `new`), `adminNotes`, `respondedAt`, and automatic `timestamps: true`.
- **Compound index** – `{ status: 1, createdAt: -1 }`, supporting the admin list's filter-by-status / sort-newest-first query. Deliberately **no** index on `email` (see Notes).
- **`applyFeedbackRequestTransform`** – Serialization transform produced by `applySerialization(feedbackRequestSchema)`; renames `_id` → `id` and strips `__v`. Exported for use on lean query results.
- **`feedbackRequestModel`** – The Mongoose model entrypoint (`model('FeedbackRequest', …)`).

## Relationships

- **`src/types/index.ts`** – Supplies the `FeedbackRequest` type and `FeedbackRequestStatus` enum used in the schema and document interface.
- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, which this file calls to derive `applyFeedbackRequestTransform`.
- **`src/modules/feedback/service.ts`** – Consumes `applyFeedbackRequestTransform` (noted in its `search()` method) and the model for queries.
- **`src/modules/feedback/repository.ts`** – Graph neighbor that builds persistence queries against `feedbackRequestModel`.
- **`src/modules/feedback/tests/integration/service.test.ts`** – Integration tests that exercise the service, thereby hitting this model and schema.

## Notes

- `FeedbackRequestDocument` intentionally re-declares `respondedAt`/`createdAt`/`updatedAt` as `Date` because the API-generated type marks them as `string`; the `Omit` prevents a conflicting re-declaration.
- No index on `email` is a deliberate choice: the only email query is case-insensitive and unanchored, so no B-tree index can satisfy it—adding one would only increase write cost.
- `applyFeedbackRequestTransform` must be applied manually to lean query results, since they bypass Mongoose's `toJSON` pipeline.
