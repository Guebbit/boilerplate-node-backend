---
source: src/modules/feedback/repository.ts
sha256: 8aca162d68509cb1febd82d924ee39198f2a3c600dcc6aaa20dbc0c3efd4f7d8
generated_at: 2026-09-23T18:40:48.252222+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/repository.ts

## Purpose

Declares the feedback-request repository instance for the feedback module. It wires the module's Mongoose model, a document-to-entity transform, and a search spec into the shared `createRepository` factory, producing a single ready-to-use CRUD + search repository export.

## Key elements

- **`feedbackRequestRepository`** (exported const) — the fully configured repository. Built by calling `createRepository<FeedbackRequestDocument, FeedbackRequest>` with three arguments:
    - `feedbackRequestModel` — the Mongoose model for feedback requests (imported from `./model`).
    - `transform: applyFeedbackRequestTransform` — maps a `FeedbackRequestDocument` to a domain `FeedbackRequest` after every read.
    - `searchable` spec:
        - `objectIds`: maps the query field `id` to the DB field `_id`.
        - `regex`: maps `email` → `email` (partial/regex match).
        - `text`: full-text search across `name`, `email`, `subject`, `message`.
    - **`status` is intentionally absent** from the searchable spec. The file's JSDoc explains it is a closed enum whose string→enum mapping is a domain decision made by the service layer, not the repository.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides the generic `createRepository` factory that this file calls to obtain the repository instance.
- **`src/modules/feedback/model.ts`** — source of `feedbackRequestModel`, `applyFeedbackRequestTransform`, and the `FeedbackRequestDocument` type.
- **`src/modules/feedback/service.ts`** — consumes `feedbackRequestRepository` for all feedback-request persistence and search operations; it is also the layer responsible for translating a raw `status` string into the domain enum before narrowing a query scope.
- **`src/modules/feedback/tests/integration/service.test.ts`** — integration tests that exercise the service, which in turn exercises this repository against a live database.
- **`src/modules/feedback/tests/integration/schema-contract.test.ts`** — validates that the Mongoose model (and therefore the document shape this repository reads) still matches the expected schema.
- **`src/modules/feedback/tests/integration/model.test.ts`** — tests the model/transform layer that feeds into this repository.

## Notes

- The `searchable` spec is static and compiled at module-load time; there is no runtime configuration. Adding a new searchable field requires editing this file.
- `status` filtering is **not** available through this repository's search interface by design. Callers (the service) must build their own `MongoFilter` for status rather than relying on the generic search API.
- The generic type parameters are `<FeedbackRequestDocument, FeedbackRequest>` — the first is the DB document, the second is the domain entity. Mixing these up when calling repository methods will cause type errors.
