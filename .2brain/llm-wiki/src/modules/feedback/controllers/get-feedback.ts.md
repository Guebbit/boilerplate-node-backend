---
source: src/modules/feedback/controllers/get-feedback.ts
sha256: 0ebabbb46169b10acbdfb4bbd4cc3bec0057cf84277cbaa3a60bacbfccf2a058
generated_at: 2026-09-23T18:39:17.931871+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/controllers/get-feedback.ts

## Purpose

Controller for `GET /feedback` and `POST /feedback/search`, the admin triage queue for feedback tickets. It builds a cacheable search endpoint (query form) and a filter-rich endpoint (body form) using the shared `createSearchController` factory also used by the products, users, and orders modules.

## Key elements

- **`searchFeedbackQuerySchema`** — Extends the orval-generated `SearchFeedbackRequestsBody` with `page` and `pageSize` (coerced from strings, since GET query params arrive as text rather than typed JSON).
- **`searchFeedbackKeyParameters`** — Array of parameter names derived from `Object.keys(searchFeedbackQuerySchema.shape)`. Used downstream to build the cache key; every parameter that affects the response must appear here.
- **`getFeedback`** — The exported controller produced by `createSearchController`. Wires the schema to `feedbackRequestService.search`, passing the caller context extracted from the request.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — Provides the `createSearchController` factory; this file supplies the entity name, schema, and `runSearch` callback.
- **`src/modules/feedback/service.ts`** — `feedbackRequestService.search` performs the actual database search; the controller delegates all domain logic here.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the authenticated caller's context for passing to the service.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema` for string-to-number coercion of pagination params.
- **`src/types/index.ts`** — Source of the `FeedbackRequestsResponse` return type.
- **`src/modules/feedback/routes.ts`** — Presumed consumer that mounts `getFeedback` onto the `GET /feedback` and `POST /feedback/search` routes.

## Notes

- **Cache-key safety:** `searchFeedbackKeyParameters` is derived from the schema shape, not hand-listed. If a controller reads a parameter that the schema does not declare, it will be missing from the cache key and two different searches could share one cached response. Add new filters to the schema first.
- **Shared factory convention:** This file mirrors the structure of the products/users/orders controllers. Changing the `createSearchController` contract affects all four modules simultaneously.
- **Two spelling forms:** The GET form is URL-safe and cacheable; the POST `/search` form accepts filters too broad or numerous for a query string. Both funnel through the same `runSearch`.
