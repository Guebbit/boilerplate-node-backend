---
source: src/modules/feedback/openapi.yaml
sha256: 7030cdcb8982a3df60745d9f5d534e9cf9dd26d6a076c544fc8dd07653166ef5
generated_at: 2026-09-27T14:53:05.247367+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the feedback module (v2.0.0). Defines the REST surface for user-submitted contact requests and the admin CRUD/triage workflow over them. Serves as the single source of truth for endpoint shapes, shared error semantics, and schema references consumed by the module's implementation and any generated client code.

## Key elements

- **`POST /feedback/contact`** (`createFeedbackRequest`) — Public (`security: []`) endpoint for submitting a contact request. Requires `AntibotChallengeTokenHeader` and `IdempotencyKeyHeader`. Returns `201` with `FeedbackRequestEnvelope`.
- **`GET /feedback`** (`listFeedbackRequests`) — Bearer-authed listing with query-only filters (`page`, `pageSize`, `text`, `email`, `status`). Returns `FeedbackRequestsResponseEnvelope`.
- **`POST /feedback/search`** (`searchFeedbackRequests`) — Body-based equivalent of `GET /feedback`; carries `x-alias-of: listFeedbackRequests`. Same auth and response envelope.
- **`PUT /feedback/{id}`** (`replaceFeedbackRequestStatus`) — Full-replacement of triage state (RFC 9110 §9.3.4). `status` is required in the body.
- **`PATCH /feedback/{id}`** (`updateFeedbackRequestStatus`) — JSON Merge Patch (RFC 7396) of status/`adminNotes`; `null` clears `adminNotes`.
- **`DELETE /feedback/{id}`** (`deleteFeedbackRequest`) — Hard delete; returns shared `Success` response.
- **`components/schemas`** — `FeedbackRequest`, `FeedbackRequestEnvelope`, `FeedbackRequestsResponseEnvelope`, `FeedbackRequestStatus`, plus request/response DTOs for each operation. All envelope schemas wrap a shared `success/status/message/data` shape.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Pervasive `$ref` target for all shared parameters (`AntibotChallengeTokenHeader`, `IdempotencyKeyHeader`, `PageParam`, `PageSizeParam`, `TextParam`, `IdPathParam`), all standard error/success responses (`Unauthorized`, `Conflict`, `ValidationError`, `TooManyRequests`, `Forbidden`, `NotFound`, `InternalError`, `Success`), and base schemas (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`, `Id`, `Email`).
- **`src/modules/feedback/module.ts`** — The runtime module this spec describes; the `operationId` values and path shapes here are what `module.ts` implements.

## Notes

- **Query-only GET filter.** `GET /feedback` deliberately rejects a request body (RFC 9110 §9.3.1; Fetch spec disallows it). The inline comment documents a historical cache-keying bug where body-borne filters were invisible to `setCache`. Use `POST /feedback/search` if you need a JSON filter payload.
- **PUT vs PATCH semantics are distinct.** PUT requires the full triage state (`status` mandatory); PATCH is a partial merge where omitted fields are untouched and explicit `null` clears `adminNotes`.
- **Idempotency + rate-limit interplay on `/feedback/contact`.** `409` = same `Idempotency-Key` still in flight; `422` = same key replayed with a different body. A separate `contactLimiters` middleware (referenced in a comment, lives in `routes.ts`) can return `429` before the handler runs.
- **Public vs authed split.** Only `POST /feedback/contact` sets `security: []`; every admin route requires `bearerAuth`.
- **`x-alias-of` is a vendor extension** — it marks `searchFeedbackRequests` as a transport-level alias of `listFeedbackRequests` for tooling that needs to know the two are functionally identical.
