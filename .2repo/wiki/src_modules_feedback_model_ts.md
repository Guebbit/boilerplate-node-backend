# src/modules/feedback/model.ts

## Purpose

Defines the Mongoose schema, model, and document interface for the `FeedbackRequest` collection. Exists as the single source of truth for the collection's shape, indexes, and serialization contract, bridging the API-generated `FeedbackRequest` type (ISO-string dates) to Mongoose's native `Date` fields.

## Key elements

- **`FeedbackRequestDocument`** — Mongoose document interface; `Omit`s the API type's `id`/`respondedAt`/`createdAt`/`updatedAt` and re-declares the three timestamps as `Date`.
- **`FeedbackRequestModel`** — type alias for `Model<FeedbackRequestDocument>`.
- **`feedbackRequestSchema`** — the `Schema` instance; declares fields (`email`, `subject`, `message`, `status`, `adminNotes`, `respondedAt`) and enables `timestamps: true`.
- **Compound index** `{ status: 1, createdAt: -1 }` — serves the admin list's status-filter + newest-first sort.
- **TTL index** `{ createdAt: 1 }` with `expireAfterSeconds` from `retentionDays` — auto-deletes expired tickets.
- **`retentionDays`** — read at import time via `environmentNumber('NODE_FEEDBACK_RETENTION_DAYS', 730, 1)`; feeds the TTL index.
- **`applyFeedbackRequestTransform`** — exported serialization function (normalises `_id`→`id`, drops `__v`); used by `service.search()` on lean results that bypass `toJSON`.
- **`feedbackRequestModel`** — the registered Mongoose model; the entrypoint for all queries.

## Relationships

- **`@types` (`src/types/index.ts`)** — imports the `FeedbackRequestStatus` enum and the `FeedbackRequest` base type that the document interface extends.
- **`@infrastructure/persistence/serialize`** — imports `applySerialization` to build `applyFeedbackRequestTransform`.
- **`@infrastructure/runtime/environment`** — imports `environmentNumber` to resolve the TTL retention value at startup.
- **`./service`** — consumes `feedbackRequestModel` and `applyFeedbackRequestTransform` (lean-result mapping).
- **`./repository`** — consumes `feedbackRequestModel` for persistence operations.
- **`tests/unit/schema-contract.test.ts`** — asserts the schema's fields, enums, and index definitions.
- **`tests/integration/service.test.ts`** — exercises the model through the service layer.

## Notes

- **Date override is intentional.** The API contract uses ISO strings; Mongoose stores `Date`. `applySerialization` narrows them back on the wire. Don't "fix" the `Omit` to a plain `Date` without updating the serializer.
- **TTL index is separate from the compound index.** Mongo only honours `expireAfterSeconds` on a single-field ascending index. Attaching it to `{ status: 1, createdAt: -1 }` would silently never expire documents.
- **TTL `expireAfterSeconds` is not updatable in place.** Changing `NODE_FEEDBACK_RETENTION_DAYS` on an existing DB has no effect until the index is dropped and recreated (use a `collMod` migration under `db/migrations/`). Same caveat applies to `audit-logs/model.ts`.
- **No index on `email` by design.** The only email query is case-insensitive and unanchored; a B-tree index cannot serve it, so it would add write cost with no read benefit.
- **`retentionDays` is captured at import time.** The TTL index is created once at startup; a process restart is required to pick up a new value (assuming the index is recreated per the caveat above).
