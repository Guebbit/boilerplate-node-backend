# src/modules/feedback/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the feedback module. Defines the four endpoints (submit, list, search, update) and all request/response schemas for the feedback & contact-request workflow, serving as the single source of truth for code generation (orval) and API documentation.

## Key elements

- **`POST /feedback/contact`** — Public (no auth) endpoint to submit a new feedback/contact request. Returns a `FeedbackRequestEnvelope` on success.
- **`GET /feedback`** — Admin list endpoint (bearerAuth). Accepts pagination and filter params (`text`, `email`, `status`) as query strings. Returns a paginated `FeedbackRequestsResponseEnvelope`.
- **`POST /feedback/search`** — DTO-friendly alias of the list endpoint; same filters in a JSON body. Marked with the custom extension `x-alias-of: listFeedbackRequests`.
- **`PUT /feedback/{id}`** — Admin endpoint to update a request's status and/or `adminNotes`.
- **`FeedbackRequest`** — Core entity schema: `id`, `email`, `subject`, `message`, `status`, `adminNotes`, `respondedAt`, `createdAt`, `updatedAt`.
- **`FeedbackRequestStatus`** — Closed enum: `new | in_progress | resolved | spam`. Named to match the type orval already derives from the frontend; renaming would be a silent breaking change.
- **Envelope schemas** (`FeedbackRequestEnvelope`, `FeedbackRequestsResponseEnvelope`) — Wrap data in the shared `{success, status, message, data}` envelope.
- **`SearchFeedbackRequestsRequest`** / **`CreateFeedbackRequest`** / **`UpdateFeedbackRequestStatusRequest`** — Request-body DTOs, all with `additionalProperties: false`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Heavily referenced for shared building blocks: envelope fields (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`), scalar types (`Id`, `Email`, `Page`, `PageSize`, `Text`), pagination meta, standard query/path parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdPathParam`), and standard error responses (`ValidationError`, `InternalError`, `Unauthorized`, `Forbidden`, `NotFound`). All refs use the relative path `../../../shared/contracts/openapi.root.yaml`.
- **`src/modules/inventory/openapi.yaml`** — Sibling module contract; no direct `$ref` dependency exists between the two files. They share the same structural conventions (envelope wrapping, `additionalProperties: false`, shared root refs) but are otherwise independent.

## Notes

- `POST /feedback/contact` has `security: []` (explicit empty array) — it is intentionally unauthenticated. All other endpoints require `bearerAuth`.
- The `GET /feedback` vs `POST /feedback/search` split is deliberate: the inline comment documents that a body on GET has no RFC 9110 semantics and would break `setCache` keying, which keys on declared query parameters. Treat the two endpoints as interchangeable at the API level but not swappable in a client that relies on cache-key correctness.
- `x-alias-of` is a **custom** OpenAPI extension (not part of the spec); tooling that ignores unknown extensions will simply not see it.
- All schemas set `additionalProperties: false`, meaning generated validators will reject unknown fields.
- The `FeedbackRequestStatus` enum was previously inlined in four places and omitted (bare `string`) in a fifth, causing drift; it is now a single `$ref` target. Do not duplicate the enum values elsewhere.
