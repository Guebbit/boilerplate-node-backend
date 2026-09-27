---
source: src/modules/feedback/controllers/get-feedback.ts
sha256: ea6568beba0dd262601a3613e2e6086b090d7b73d7d36614c7c4066f6b368620
generated_at: 2026-09-27T14:52:26.581928+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/controllers/get-feedback.ts

## Purpose

Controller for the admin feedback triage queue (`GET /feedback` and `POST /feedback/search`). It validates and coerces query/pagination params, then delegates to the feedback service via the shared search-controller factory. Exists to keep the admin search surface thin and consistent with other search endpoints while enforcing that the result is per-admin (never cached).

## Key elements

- **`searchFeedbackQuerySchema`** — Extends the orval-generated `SearchFeedbackRequestsBody` with `page` and `pageSize` (both coerced from string to number via `pageSchema`/`pageSizeSchema`). Used as the validation schema for both GET query and POST body forms.
- **`getFeedback`** (exported) — The controller built by `createSearchController`. Wires the schema to `feedbackRequestService.search`, passing the parsed body and the caller context extracted from the request.

## Relationships

- **`create-search-controller.ts`** — Provides the `createSearchController` factory; this file is a concrete instantiation of it with entity `"feedback"`.
- **`service.ts`** (`feedbackRequestService`) — The `runSearch` callback calls `feedbackRequestService.search(parsed, callerContextOf(request))`; all domain logic lives there.
- **`request.ts`** — Supplies `callerContextOf`, which extracts the admin's identity/context from the incoming request so the service can scope results to that caller.
- **`schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema`, the shared string-to-number coercion validators for pagination params.
- **`src/types/index.ts`** — Source of the `FeedbackRequestsResponse` return type.
- **`routes.ts`** — Mounts `getFeedback` onto the `/feedback` and `/feedback/search` routes (this file is the handler it registers).

## Notes

- Explicitly **never Redis-cached**: the doc comment states the response is one admin's queue, not a shared shop-wide answer. Any caching layer upstream should treat this endpoint as cache-ineligible.
- `page`/`pageSize` arrive as **query strings** on the GET form, so the schema extends the orval-generated body schema with coerced (string→number) versions rather than reusing the JSON-typed fields.
- The orval-generated `SearchFeedbackRequestsBody` (from `@api/schemas.zod`) is the base shape for search filters (status, email, text); this file only adds pagination.
