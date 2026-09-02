# src/modules/feedback/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the feedback module. Defines the five endpoints (submit, list, search, update-status, delete) and all module-local schemas that govern the feedback/contact-request workflow. Serves as the single source of truth for code generation (orval) and API documentation for this module.

## Key elements

- **`POST /feedback/contact`** (`createFeedbackRequest`) — Public (no auth). Accepts `CreateFeedbackRequest`, returns `FeedbackRequestEnvelope`. Includes a `website` honeypot field.
- **`GET /feedback`** (`listFeedbackRequests`) — Bearer-auth. Filtered via query params (`page`, `page_size`, `text`, `email`, `status`). Returns `FeedbackRequestsResponseEnvelope`.
- **`POST /feedback/search`** (`searchFeedbackRequests`) — Bearer-auth. JSON-body equivalent of the GET above; carries `x-alias-of: listFeedbackRequests`. Exists because a body on GET is non-portable and invisible to query-param-keyed caches.
- **`PUT /feedback/{id}`** (`updateFeedbackRequestStatus`) — Bearer-auth. Updates status/admin notes via `UpdateFeedbackRequestStatusRequest`.
- **`DELETE /feedback/{id}`** (`deleteFeedbackRequest`) — Bearer-auth. Permanent removal; returns shared `Success` response.
- **`FeedbackRequestStatus`** — Closed enum: `new`, `in_progress`, `resolved`, `spam`. Named to match the type orval already derived from the inline copy; renaming would silently break five frontend imports.
- **`CreateFeedbackRequest`** — Required: `email`, `subject`, `message`. Optional: `name`, `website` (honeypot, never persisted or returned).
- **`FeedbackRequest`** — The entity shape returned in envelopes. No `website` property (honeypot is request-only).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Heavily referenced via `$ref` for shared building blocks: `EnvelopeSuccess`/`EnvelopeStatus`/`EnvelopeMessage`, `Id`, `Email`, pagination parameters (`PageParam`, `PageSizeParam`, `TextParam`), `IdPathParam`, and standard error responses (`ValidationError`, `InternalError`, `Unauthorized`, `Forbidden`, `NotFound`, `Success`). This file composes those into module-specific envelopes and request bodies.
- **`src/modules/inventory/openapi.yaml`** — Sibling module contract in the same `src/modules/` tree. No cross-references are visible in this file; the two modules are structurally parallel but independent.

## Notes

- **`security: []` on POST /feedback/contact** is intentional (public endpoint). All admin-facing operations use `bearerAuth`.
- **`POST /feedback/search` vs `GET /feedback`** — The two are functionally identical; the POST exists because (a) the Fetch spec rejects request bodies on GET, and (b) the frontend's `setCache` keys on declared query params, so a body-borne filter would be invisible to the cache key and cause stale reads. Treat the POST as the DTO-friendly alias, not a separate capability.
- **`FeedbackRequestStatus` naming** — Deliberately *not* shortened to `FeedbackStatus`; the name is frozen to match the already-generated orval type. The enum is defined once here and `$ref`-ed everywhere it appears (query param, response, update body) to prevent the inline-copy drift that previously let `GET /feedback` accept any string while `POST /feedback/search` validated the enum.
- **Honeypot (`website`)** — Present only in the *request* schema. A non-empty value flags the submission as spam. It is absent from `FeedbackRequest`, confirming it is never stored or exposed.
- **Relative `$ref` depth** — All shared-contract references use `../../../shared/contracts/openapi.root.yaml`. If this file moves in the tree, every shared ref breaks silently at generation time.
