# src/modules/feedback/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the feedback module, defining the public contact-submission endpoint, the authenticated admin review/search/update endpoints, and the module-local schemas they consume. It serves as the single source of truth for code generation (orval) and API validation for this module.

## Key elements

- **`POST /feedback/contact`** (`createFeedbackRequest`) — Public endpoint (empty `security: []`) that accepts a `CreateFeedbackRequest` body and returns a `FeedbackRequestEnvelope`. Triggers admin email notification per the description.
- **`GET /feedback`** (`listFeedbackRequests`) — Bearer-authenticated paginated listing. Filters via query parameters (`page`, `pageSize`, `text`, `email`, `status`). Returns `FeedbackRequestsResponseEnvelope`.
- **`POST /feedback/search`** (`searchFeedbackRequests`) — Body-based DTO equivalent of the above; marked `x-alias-of: listFeedbackRequests`. Exists because a body on GET is semantically undefined (RFC 9110 §9.3.1) and would be invisible to query-param-based cache keys.
- **`PUT /feedback/{id}`** (`updateFeedbackRequestStatus`) — Bearer-authenticated; accepts `UpdateFeedbackRequestStatusRequest` (status + adminNotes) and returns the updated `FeedbackRequestEnvelope`.
- **`FeedbackRequestStatus`** — Closed enum (`new`, `in_progress`, `resolved`, `spam`) referenced by all paths that filter or mutate status. Named specifically to match the orval-derived TypeScript type already imported by the frontend; renaming would be a silent breaking change.
- **`FeedbackRequest`** — Core entity schema (id, email, subject, message, status, adminNotes, timestamps). All timestamps are `date-time` strings.
- **`FeedbackRequestEnvelope` / `FeedbackRequestsResponseEnvelope`** — Standard envelope wrappers (`success`, `status`, `message`, `data`) around single or list payloads.
- **`CreateFeedbackRequest` / `SearchFeedbackRequestsRequest` / `UpdateFeedbackRequestStatusRequest`** — Request-body schemas; all use `additionalProperties: false`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Heavily referenced. This file pulls shared envelope primitives (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`), reusable parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdPathParam`), common schemas (`Id`, `Email`, `Page`, `PageSize`, `Text`, `PaginationMeta`), and standard error responses (`ValidationError`, `InternalError`, `Unauthorized`, `Forbidden`, `NotFound`) from that file. Changing any of those shared definitions propagates into the feedback contract.
- **`src/modules/inventory/openapi.yaml`** — Sibling module in the dependency graph. No direct schema, parameter, or response references exist between the two files in this contract.

## Notes

- `POST /feedback/search` is **not** a separate backend operation; it is an alias (`x-alias-of`) so the same handler serves both the GET query-param form and the POST body form. Tooling that generates separate clients from `operationId` will produce two methods that hit the same logic.
- All response error codes (`401`, `403`, `404`, `422`, `500`) are `$ref`'d from the shared root contract rather than defined inline. There is no local error-response definition to update.
- `additionalProperties: false` is set on every schema in this file. Adding a field to a request body without updating this spec will fail validation.
- The `FeedbackRequestStatus` enum is intentionally named after the orval-generated type, not after a "cleaner" domain name. Do not rename it without coordinating a frontend migration.
