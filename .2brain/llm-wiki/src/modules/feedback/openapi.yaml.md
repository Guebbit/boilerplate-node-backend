---
source: src/modules/feedback/openapi.yaml
sha256: e364d01f7b64a30da743786ef5b2f3756a7e5c07f78cfbbdc776ef6d24f41d16
generated_at: 2026-09-23T18:40:29.880682+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the feedback module. It declares the REST endpoints (submit, list, search, update, delete feedback requests), their request/response shapes, and the shared component references, serving as the single source of truth for code generation (orval) and API documentation.

## Key elements

- **`/feedback/contact` (POST)** – Public endpoint for submitting a contact/feedback request. Requires `AntibotChallengeTokenHeader` and `IdempotencyKeyHeader`; guarded by `contactLimiters` (429).
- **`/feedback` (GET)** – Admin endpoint to list feedback requests with query-string pagination and filters (`page`, `pageSize`, `text`, `email`, `status`). Requires `bearerAuth`.
- **`/feedback/search` (POST)** – Functionally identical to `GET /feedback` but accepts a JSON body for filtering. Marked `x-alias-of: listFeedbackRequests`. Exists because a request body on GET has no defined semantics (RFC 9110 §9.3.1) and the cache key (`setCache`) only sees declared query parameters.
- **`/feedback/{id}` (PUT / DELETE)** – Admin endpoints to update status/notes or permanently delete a single feedback request.
- **`FeedbackRequest`** – Core record schema (id, email, subject, message, status, adminNotes, timestamps).
- **`FeedbackRequestStatus`** – Closed enum: `new | in_progress | resolved | spam`. Shared by both the list query param and the search body to prevent validation drift.
- **`FeedbackRequestEnvelope` / `FeedbackRequestsResponseEnvelope`** – Standard success envelopes wrapping single/list payloads.
- **`CreateFeedbackRequest` / `UpdateFeedbackRequestStatusRequest` / `SearchFeedbackRequestsRequest`** – Request body schemas.

## Relationships

- **`shared/contracts/openapi.root.yaml`** – Extensively `$ref`-ed for shared parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdPathParam`, `AntibotChallengeTokenHeader`, `IdempotencyKeyHeader`), shared error responses (`Unauthorized`, `Conflict`, `ValidationError`, `TooManyRequests`, `Forbidden`, `NotFound`, `InternalError`, `Success`), and common value schemas (`Id`, `Email`, `EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`).
- **`src/modules/feedback/module.ts`** – The TypeScript module that wires the route handlers implementing the operations declared in this spec (operationIds like `createFeedbackRequest`, `listFeedbackRequests`, etc.).

## Notes

- **Naming constraint on `FeedbackRequestStatus`:** The enum name is intentionally `FeedbackRequestStatus` (not a tidier `FeedbackStatus`) because orval had already generated a type with that name from the inline copy on `FeedbackRequest.status`. Renaming would be a silent breaking change to five frontend import sites. The point of extracting the `$ref` is to eliminate duplication, not to rename.
- **Why two list endpoints exist:** `GET /feedback` and `POST /feedback/search` are not redundant convenience aliases. A GET body is rejected by the Fetch spec, and `setCache` keys exclusively on declared query parameters—so a body-borne filter on GET would be invisible to the cache key, causing two different filters to share one cache entry.
- **`security: []` on `/feedback/contact`:** Explicitly empty (public, no bearer token), in contrast to all other endpoints which require `bearerAuth`.
- **Truncated file:** The content shown is cut off mid-schema (`CreateFeedbackRequest`); additional schemas (e.g., `UpdateFeedbackRequestStatusRequest`, `SearchFeedbackRequestsRequest`, `FeedbackRequestsResponse`) are defined below the visible portion.
