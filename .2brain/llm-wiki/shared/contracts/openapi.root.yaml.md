---
source: shared/contracts/openapi.root.yaml
source_sha256: 2029cb65b658cac0c0b11b0338add1685629b6cc68231449ffb7a2959f045f75
context_sha256: dcb2b863c8afe42da05a03b500cf3bb692cd5d483c5193b3cb2d056fdd8cf00a
generated_at: 2026-11-22T02:23:57.635271+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/openapi.root.yaml

## Purpose

The root OpenAPI 3.1.0 document for the "Boilerplate API" (version `0.1.0`, AGPL-3.0-or-later). It holds the contract-wide metadata and the error codes that belong to no single module. Its `info.description` serves as the written contract for cross-cutting behavior: language negotiation, success shapes, and error shapes. The API is described as codegen-oriented and meant for multi-project, multi-language use (client/server stubs, DTOs, SDKs).

## Key elements

- **`info`**: title, license, alpha version `0.1.0` (the first real version is to be `1.0.0`), and contact (`API Team`).
- **`info.description`**: the cross-cutting contract, covering:
  - **Language (`Accept-Language`)**:
    - One language is picked per request, from the languages switched on in `GET /locales`.
    - It affects user-facing copy, translated entity fields and `errors[].message`. It never changes the response shape, the status code, or `errors[].code`.
    - Missing wording falls back to the default language, one message at a time.
    - `Content-Language` and `Vary: Accept-Language` are set on translated answers.
    - Reads with no language-dependent words (`/config`, `/shop`, `/payments/methods`, `/delivery/methods`, `/products/facets`, the `/locales` reads) set neither header. The two dictionary reads name the path's language in `Content-Language`.
    - Staff holding `display:Locale` can preview draft languages on the product reads and the example read. Those answers are `Cache-Control: private, no-store`.
  - **Successes**:
    - A 2xx returns the resource with no wrapper.
    - Lists are objects (`{ items, meta }` with `PaginationMeta`, or a named key).
    - `204` has no body, and a create returns `201` with `Location`.
  - **Errors**:
    - Every application-level 4xx/5xx is RFC 9457 `application/problem+json`, with `type: about:blank`, `title`, `status`, `detail`, `instance` (`urn:uuid:…`) and an `errors` extension whose `code` is the machine key.
    - This covers unmatched paths (404) and wrong methods (405 with `Allow`).
    - Some statuses (400, 431, 408, 413) can be answered by the HTTP server layer with no body.
  - **Header policy**: `Accept-Language` is deliberately not declared per operation, so generated functions don't gain a redundant argument.
- **`x-error-codes`**: the catalogue of module-less error codes. Each entry has `status` and `description`, and most have `scope: app`. Groups visible:
  - **HTTP-status defaults**: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, `VALIDATION_ERROR`, `UNPROCESSABLE_CONTENT`, `CLIENT_ERROR`, `INTERNAL_SERVER_ERROR`, `METHOD_NOT_ALLOWED`, `CONTENT_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`.
  - **Multipart limits (multer)**: `LIMIT_PART_COUNT`, `LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`, `LIMIT_FIELD_KEY`, `LIMIT_FIELD_VALUE`, `LIMIT_FIELD_COUNT`, `LIMIT_UNEXPECTED_FILE`, `MISSING_FIELD_NAME`.
  - **Availability and rate limiting**: `SERVICE_UNAVAILABLE`, `QUERY_TIMEOUT` (both 503 with `Retry-After`), `RATE_LIMITED` and `TOO_MANY_REQUESTS` (429).
  - **Idempotency**: `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_IN_FLIGHT`, `IDEMPOTENCY_OUTCOME_UNKNOWN`, `IDEMPOTENCY_KEY_MISMATCH`.
  - **Auth and role**: `ROLE_MANAGEMENT_REQUIRED`, `REAUTH_REQUIRED`, `SECOND_FACTOR_ENROLLMENT_REQUIRED`.
  - More entries follow in the file.

## Relationships

- Per the file's own comments, a bundler collects `x-error-codes` from every module's own fragment. It merges them with this file's entries into one catalogue, published as the bundled document's top-level `x-error-codes`.
- `shared/contracts/spectral.yaml`, `shared/contracts/spectral.modules.yaml` and `scripts/audit/api-standards.yaml` are linked to this file in the dependency graph. The visible content does not show how, and it does not reference them directly. They are presumably lint and audit configuration for this contract.

## Notes

- **Error codes as a vendor extension.** The catalogue is deliberately *not* an `enum` on `errors[].code`. A new code is therefore additive rather than a breaking response change (Zalando guideline #112).
- **Scope.** Codes here are "module-less": status-derived defaults, or checks that run before any route. A module's own codes are declared in its own fragment.
- **`scope: app` is partial.** Only some entries carry it. The idempotency and role/reauth codes omit it.
- **Status-only fallbacks.** `UNPROCESSABLE_CONTENT` (422), `CLIENT_ERROR` (4xx) and `TOO_MANY_REQUESTS` (429) are derived codes for status-only responses. The file says nothing sends `TOO_MANY_REQUESTS` today.
- **`Accept-Language` contract.** The header is documented only in `info.description`, not on each operation. Treat that paragraph as authoritative when generating clients.
