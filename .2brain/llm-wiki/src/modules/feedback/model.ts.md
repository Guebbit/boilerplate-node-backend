---
source: src/modules/feedback/model.ts
sha256: 1bf6173d702e254ca5da0fc2aa766b001d2998ac397530261bbfd27bcd472bd1
generated_at: 2026-09-23T18:40:04.886033+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/model.ts

## Purpose

Defines the Mongoose schema, document type, and model for the `FeedbackRequest` collection. It bridges the API-generated `FeedbackRequest` type (ISO-string dates) with Mongoose's native `Date` fields, wires up the indexes the feedback admin UI relies on, and exposes a serialization transform so lean query results can be shaped the same as hydrated documents.

## Key elements

- **`FeedbackRequestDocument`** – Interface extending `Omit<FeedbackRequest, …> & Document`; overrides `respondedAt`, `createdAt`, `updatedAt` from `string` to `Date`.
- **`FeedbackRequestModel`** – Type alias for `Model<FeedbackRequestDocument>`.
- **`feedbackRequestSchema`** – Mongoose `Schema` with fields `name`, `email`, `subject`, `message`, `status` (enum from `FeedbackRequestStatus`), `adminNotes`, `respondedAt`, plus `timestamps: true`. Two indexes are attached:
  - `{ status: 1, createdAt: -1 }` – compound index for the admin list's status filter + newest-first sort.
  - `{ createdAt: 1 }` with `expireAfterSeconds` – TTL index that auto-deletes tickets past the retention window.
- **`retentionDays`** – Module-level `const` read from `NODE_FEEDBACK_RETENTION_DAYS` (default 730). Evaluated once at import time because the TTL index is created at boot.
- **`applyFeedbackRequestTransform`** – Serialization helper (built via `applySerialization`) that maps `_id` → `id` and drops `__v`. Exported so lean results in `service.ts#search()` can reuse it.
- **`feedbackRequestModel`** – The Mongoose model instance registered under the `'FeedbackRequest'` collection name.

## Relationships

- **`src/types/index.ts`** – Source of the `FeedbackRequest` type and `FeedbackRequestStatus` enum consumed here.
- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, which this file calls to build `applyFeedbackRequestTransform`.
- **`src/infrastructure/runtime/environment.ts`** – Provides `environmentNumber`, used to read the retention-days setting.
- **`src/modules/feedback/index.ts`** – Module barrel; re-exports the symbols defined here.
- **`src/modules/feedback/service.ts`** – Consumes `feedbackRequestModel` and `applyFeedbackRequestTransform` (lean-query path).
- **`src/modules/feedback/repository.ts`** – Persists/queries through `feedbackRequestModel`.
- **`src/modules/feedback/tests/unit/schema-contract.test.ts`** – Asserts the schema's shape, required fields, and enum values.

## Notes

- **TTL index is immutably bound at boot.** Changing `NODE_FEEDBACK_RETENTION_DAYS` and simply restarting will fail the Mongoose `autoIndex` step because Mongo refuses to alter an existing TTL index's `expireAfterSeconds` in place. Run `npm run db:sync` to drop and rebuild the index. The same caveat applies to the analogous TTL index in `audit-logs/model.ts`.
- **No index on `email` is intentional.** The only email query is a case-insensitive, unanchored match; a B-tree index cannot serve it, so omitting it avoids write overhead for no read benefit.
- **Date fields are `Date` in Mongo, `string` on the wire.** The generated API type says `string`; this file narrows to `Date` for Mongoose, and `applySerialization` (via `applyFeedbackRequestTransform`) converts back to ISO strings at the boundary. Lean query results bypass `toJSON`, so callers must explicitly apply the transform.
- **`retentionDays` is a module-level `const`.** It is not re-evaluated per request; the value is fixed for the lifetime of the process.
