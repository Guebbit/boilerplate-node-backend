---
source: src/modules/example/openapi.yaml
sha256: 96ad687ee10cdcdc7d120c5a74b2c589f4d3bf8d4d9c41954e527b29d5e5c3ce
generated_at: 2026-11-14T19:59:49.666781+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **example** module — a small, complete reference domain intended as the starting template for new modules. It declares the full CRUD surface (`/examples`, `/examples/search`, `/examples/{id}`), the status lifecycle (draft → published → archived), custom error codes, and the module's slice of the account data export. The tag description explicitly notes it is safe to delete.

## Key elements

- **`x-error-codes`** — Module-level 409 codes for illegal status transitions (`EXAMPLE_NOT_PUBLISHABLE`, `EXAMPLE_NOT_ARCHIVABLE`, `EXAMPLE_NOT_UNARCHIVABLE`), each documenting the `details` payload and which `Example.actions.*` flag signals the transition is open.
- **`x-personal-data`** — Declares the `examples` array that the bundler injects into `POST /account/export`'s `AccountExportResponse`.
- **`/examples` (GET/POST)** — List (query-param filtered, JSON:API sort grammar) and create (idempotent via `Idempotency-Key`; rate-limited by `createExampleLimiter`).
- **`/examples/search` (POST)** — DTO-friendly alias (`x-alias-of: listExamples`) that accepts the same filters as a JSON body instead of query params.
- **`/examples/{id}` (GET/PUT/PATCH/DELETE)** — Full CRUD. PUT requires `title`+`body` (RFC 9110 §9.3.4 whole-replacement); PATCH uses RFC 7396 merge-patch (accepts both `application/json` and `application/merge-patch+json`).
- **`x-versioned`** — Marks operations that receive bundler-injected `ETag`/`If-Match` headers and 412 handling.
- **`x-cache: private-no-cache`** — On both list and single-read responses, signalling the answer varies by caller.
- **Security scopes** — `read:Example`, `create:Example`, `update:Example`, `delete:Example`, `display:Example` (cross-account read), plus unauthenticated/cookie access for published reads.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All shared `$ref` targets (parameters: `PageParam`, `PageSizeParam`, `TextParam`, `IdPathParam`, `IdempotencyKeyHeader`; responses: `Unauthorized`, `Forbidden`, `ValidationError`, `Conflict`, `NotFound`, `TooManyRequests`; headers: `Location`) resolve into this file.
- **`src/modules/example/rules.yaml`** — Sibling module file (presumably runtime validation rules or routing config) that pairs with this contract; not referenced by `$ref` from the YAML but co-located as the module's rule set.

## Notes

- **404, never 403, for unowned resources** — `GET /examples/{id}` deliberately leaks no ownership or draft-existence signal; only the owner (or a `display:Example` holder) gets a 200.
- **Status changes are separate endpoints** — `publish`, `archive`, `unarchive` live under `POST /examples/{id}/…` (truncated in this file); PUT/PATCH never mutate `status`.
- **Idempotency on create only** — `Idempotency-Key` is a shared header param; 409 means in-flight, 422 means key-reuse-with-different-body.
- **Bundler-injected headers** — `ETag`, `Content-Location`, `If-Match`, and 412 are added post-hoc per `x-versioned`; they do not appear in the visible response schemas.
- **Delete cascades to cover image** — Not a separate API; implied by the DELETE description.
