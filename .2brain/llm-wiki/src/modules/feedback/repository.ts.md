---
source: src/modules/feedback/repository.ts
sha256: 4cd5d1c787d32f10907f8b1c55a830fee417c7a9ee0f1f79485dda3cfa9ac18d
generated_at: 2026-09-27T14:53:13.539582+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/repository.ts

## Purpose

Declares `feedbackRequestRepository`, the CRUD access layer for feedback requests. It is a thin instantiation of the shared `createRepository` factory, wired to the feedback domain model and a search spec. The file exists so the service layer can query and persist feedback documents without touching the persistence infrastructure directly.

## Key elements

- **`feedbackRequestRepository`** (exported const) — The repository instance created by `createRepository<FeedbackRequestDocument, FeedbackRequest>`. Accepts the model, a document→domain transform, and a search spec.
- **Search spec** — Defines three query strategies: `objectIds` (maps `id` → `_id`), `regex` (on `email`), and `text` (across `name`, `email`, `subject`, `message`).
- **`transform`** — `applyFeedbackRequestTransform` from `./model`; converts a raw document into the `FeedbackRequest` domain type on read.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Supplies the `createRepository` factory that produces the repository instance.
- **`src/modules/feedback/model.ts`** — Provides `feedbackRequestModel` (schema/CRUD definition), `applyFeedbackRequestTransform`, and the `FeedbackRequestDocument` type.
- **`src/modules/feedback/service.ts`** — The consumer of `feedbackRequestRepository`; makes domain-level decisions (e.g., status scoping) before calling the repository.
- **`src/types/index.ts`** — Source of the `FeedbackRequest` domain type used as the repository's output type.
- **`src/modules/feedback/tests/integration/service.test.ts`** — Exercises the service→repository path end-to-end.

## Notes

- `status` is intentionally **absent** from the search spec. It is a closed enum; mapping a raw string to it is a service-layer decision, not a repository concern. Do not add it to `searchable` here.
- The repository is created once at module load (no per-call instantiation). Import the named export rather than calling `createRepository` again.
- The module JSDoc points to `docs/modules/feedback.md` for broader module context.
