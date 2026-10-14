---
source: src/modules/feedback/repository.ts
sha256: bf8e0026009551f45ed0508da99b4698eb9e531bfd17d92057e39d25e650cb8b
generated_at: 2026-10-14T15:50:30.575113+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/repository.ts

## Purpose

Defines the data-access layer for feedback requests. It wires the Mongoose model, the document→domain transform, and a declarative search spec into the shared repository factory so that the service layer can query, sort, and retrieve `FeedbackRequest` records without touching ODM specifics directly.

## Key elements

- **`feedbackRequestRepository`** (exported const) — the sole public export. A fully-typed repository instance (`FeedbackRequestDocument` ↔ `FeedbackRequest`) created via `createRepository`. It carries:
  - **`transform: applyFeedbackRequestTransform`** — maps a raw Mongo document to the domain shape on read.
  - **`searchable.objectIds`** — allows filtering by `id` (mapped to `_id`).
  - **`searchable.regex`** — allows regex matching on `email`.
  - **`searchable.text`** — full-text / substring search across `name`, `email`, `subject`, `message`.
  - **`searchable.sortable`** — permitted sort keys: `createdAt`, `status`, `email`.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the generic `createRepository` factory that this file calls to assemble the repository.
- **`src/modules/feedback/model.ts`** — provides `feedbackRequestModel` (Mongoose model), `applyFeedbackRequestTransform` (document→domain mapper), and the `FeedbackRequestDocument` type.
- **`src/modules/feedback/service.ts`** — primary consumer; receives the repository to perform CRUD and apply domain-level filtering (e.g. the `status` scope).
- **`src/types/index.ts`** — source of the `FeedbackRequest` domain type used as the repository's output generic.
- **`src/modules/feedback/tests/integration/*.test.ts`** — integration tests exercise the service (and by extension this repository) against a live database; `schema-contract.test.ts` validates the model/schema alignment this repository depends on.

## Notes

- `status` is **intentionally excluded** from the `searchable` spec. It is a closed enum; the service layer decides how a raw string maps to an enum value and passes it down as a scope. Do not add `status` to `text` or `regex` here — that mapping is a domain decision, not a persistence concern.
- The file is a thin, single-export module. All query semantics live in the `searchable` object and the `transform` function (both defined in `model.ts` or supplied by the factory). There is no custom query logic in this file.
