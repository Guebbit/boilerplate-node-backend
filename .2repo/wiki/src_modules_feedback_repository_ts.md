# src/modules/feedback/repository.ts

## Purpose

Declares the feedback-request repository instance using the shared `createRepository` factory. It wires the domain model, document transform, and searchable-field spec together so that the service layer gets a ready-made CRUD/search interface without reimplementing persistence logic.

## Key elements

- **`feedbackRequestRepository`** (exported constant) — the sole export. A repository instance created by `createRepository<FeedbackRequestDocument>` configured with:
  - `transform`: `applyFeedbackRequestTransform` — applied to documents on read.
  - `searchable`:
    - `objectIds`: maps the logical `id` field to the Mongo `_id` field.
    - `regex`: enables regex search on `email`.
    - `text`: enables full-text search across `name`, `email`, `subject`, `message`.
  - **`status` is intentionally omitted** from the searchable spec (see Notes).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Provides the `createRepository` factory that this file calls to build the repository instance.
- **`src/modules/feedback/model.ts`** — Supplies `feedbackRequestModel` (the collection/schema definition), `applyFeedbackRequestTransform` (document shape mapper), and the `FeedbackRequestDocument` type used as the generic parameter.
- **`src/modules/feedback/service.ts`** — Consumes `feedbackRequestRepository` for reads/writes. The module doc-comment notes that `status` filtering is a *service*-level domain decision, not a repository concern.
- **`src/modules/feedback/tests/integration/*.test.ts`** — Integration tests exercise the repository through the service and model contracts.

## Notes

- **No `status` in the search spec.** The inline comment is explicit: `status` is a closed enum, and translating a raw user-supplied string into that enum is a domain decision. The service is expected to resolve `status` into a pre-built query scope *before* calling the repository, rather than letting the repository accept an arbitrary string.
- The file contains no business logic of its own — all behavior is delegated to the factory, the model, and the transform. If CRUD/search behavior looks wrong, inspect `create-repository.ts` and `model.ts` first.
