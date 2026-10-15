---
source: src/modules/feedback/openapi.yaml
sha256: 1ce2337d17439afabb09192073e9824d7df0616b93a11c8c1141d31aa941a3a1
generated_at: 2026-10-15T10:32:21.957859+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the feedback module: the public contact-submission endpoint and the authenticated admin queue (list, search, update, delete) for visitor feedback requests. It also declares the module's contribution to the account data export via the `x-personal-data` extension.

## Key elements

- **`x-personal-data`** – Extension key consumed by the account-export bundler; when `NODE_EXPORT_INCLUDE_FEEDBACK=true` it adds an optional `feedback` array (`ExportFeedbackTicket[]`) to `AccountExportResponse`.
- **`POST /feedback/contact`** (`createFeedbackRequest`) – Public (no auth). Anti-bot + idempotency headers required. Returns `201` with a `Location` header; 401/409/422/429/500 for the usual failure modes.
- **`GET /feedback`** (`listFeedbackRequests`) – Admin list with pagination, sort, text, email, and status query filters. Requires `bearerAuth` **or** `apiKeyAuth`.
- **`POST /feedback/search`** (`searchFeedbackRequests`) – DTO-friendly alias of the above (`x-alias-of: listFeedbackRequests`); same filters in a JSON body instead of query params.
- **`PUT /feedback/{id}`** (`replaceFeedbackRequestStatus`) – Full replace of triage state; `status` is required (RFC 9110 §9.3.4).
- **`PATCH /feedback/{id}`** (`updateFeedbackRequestStatus`) – RFC 7396 merge-patch; omitted fields unchanged, `null` clears `adminNotes`. Accepts both `application/json` and `application/merge-patch+json`.
- **`DELETE /feedback/{id}`** (`deleteFeedbackRequest`) – Hard delete.
- **`FeedbackRequestSort`** – Local schema: 1–3-item string array with `enum [createdAt, -createdAt, status, -status, email, -email]`; leading `-` means descending.

## Relationships

- **`shared/contracts/openapi.root.yaml`** – Every shared parameter (`IdPathParam`, `PageParam`, `PageSizeParam`, `TextParam`, `AntibotChallengeTokenHeader`, `IdempotencyKeyHeader`), response (`Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `TooManyRequests`, `InternalError`, `Success`), and header (`Location`) is `$ref`-ed from that root file. This file never redefines them.
- **`src/modules/feedback/module.ts`** – The module entry point that registers this spec with the framework (route mounting, tag wiring, and likely the export-bundler hook that reads `x-personal-data`).

## Notes

- The `GET /feedback` query-param design is intentional: a body on GET is semantically undefined (RFC 9110 §9.3.1), and the server's `setCache` keys on declared query params, so a body-borne filter would be invisible to the cache key. `POST /feedback/search` exists as the safe alternative.
- `PUT` requires `status` in the body (whole-state replace); `PATCH` does not (merge semantics). Don't confuse the two when generating or reviewing client code.
- The `x-alias-of` extension is a custom, non-standard annotation linking `searchFeedbackRequests` back to `listFeedbackRequests`; tooling may ignore it.
- Rate limiting is handled by `contactLimiters` in `routes.ts` (referenced in a comment), not by any field in this spec.
