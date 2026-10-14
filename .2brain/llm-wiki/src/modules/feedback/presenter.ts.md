---
source: src/modules/feedback/presenter.ts
sha256: ccbadd15f3c77872c82da04801bf87f257dbf48ff9b49dad7db34c43d3577acc
generated_at: 2026-10-14T15:50:15.505775+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/presenter.ts

## Purpose

Centralizes the transformation from a Mongoose feedback document to the wire shape declared in `openapi.yaml`, so the two feedback controllers share one transform instead of each casting `.toJSON()` independently.

## Key elements

- **`presentFeedbackRequest(document: FeedbackRequestDocument): FeedbackRequest`** — The sole export. Calls the Mongoose document's `.toJSON()` (which renames `_id` → `id` and converts dates to ISO strings) and casts the result to `FeedbackRequest`.

## Relationships

- **`src/modules/feedback/model.ts`** — Provides the `FeedbackRequestDocument` type that this function accepts as its input.
- **`src/types/index.ts`** — Provides the `FeedbackRequest` wire-shape type that this function returns.
- **`src/modules/feedback/controllers/post-feedback-contact.ts`** — Consumes `presentFeedbackRequest` to serialize a document before responding.
- **`src/modules/feedback/controllers/update-feedback-status.ts`** — Consumes `presentFeedbackRequest` for the same purpose.

## Notes

- The `as FeedbackRequest` cast is load-bearing: Mongoose types `.toJSON()` as `any`, so without it the return type is erased. The function adds no logic beyond the cast—its value is purely the shared, typed entry point.
- If the model's serialization behavior changes (e.g., a new computed field in `toJSON()`), this is the single place to review.
