---
source: src/modules/example/openapi.yaml
sha256: 2dfdd687a051ce2f2d1be73904a6570d2ffb403e0662ba798bffce49a43bd436
generated_at: 2026-11-08T05:51:26.052112+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the "example" module — a small, complete reference domain meant as a template for new modules. It defines the full CRUD surface for an `Example` resource (list, create, search, read, replace, update, delete, plus status-transition operations) and declares module-level metadata (tags, custom error codes, personal-data export section) that a bundler consumes to assemble the root spec.

## Key elements

- **`tags`** — Registers the `Examples` tag with `x-family: Example`; used by the bundler to group operations.
- **`x-error-codes`** (module-level) — Declares domain-specific 409 codes (`EXAMPLE_NOT_PUBLISHABLE`, `EXAMPLE_NOT_ARCHIVABLE`, `EXAMPLE_NOT_UNARCHIVABLE`) with machine-readable `details` shapes for status-conflict responses.
- **`x-personal-data`** — Specifies the `examples` array the bundler injects into `POST /account/export` (`AccountExportResponse`).
- **`GET /examples`** (`listExamples`) — Paginated, sortable (JSON:API `?sort=-createdAt,title`), filterable listing; query-parameter interface.
- **`POST /examples`** (`createExample`) — Creates a draft; supports `Idempotency-Key` header; rate-limited by `createExampleLimiter` (see `routes.ts`).
- **`POST /examples/search`** (`searchExamples`) — DTO-body equivalent of `GET /examples`; marked `x-alias-of: listExamples`.
- **`/examples/{id}`** (`getExampleById`, `replaceExampleById`, `updateExampleById`, `deleteExampleById`) — Full CRUD on a single example. Annotated `x-versioned` for `If-Match`/`ETag` handling on all four verbs. PUT uses RFC 9110 whole-replacement; PATCH uses RFC 7396 JSON Merge Patch (both `application/json` and `application/merge-patch+json`).
- **Local `$ref`s** (`#/components/schemas/…`) — Point to schemas defined later in the same file (truncated): `Example`, `ExampleStatus`, `ExampleSort`, `CreateExampleRequest`, `SearchExamplesRequest`, `ReplaceExampleRequest`, `UpdateExampleRequest`, `ExamplesResponse`, `ExportExample`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This file `$ref`s shared parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdPathParam`, `IdempotencyKeyHeader`), standard error responses (`Unauthorized`, `Forbidden`, `NotFound`, `ValidationError`, `Conflict`, `TooManyRequests`, `NoContent`), and the `Location` header. The root spec bundles this module's paths into the combined document.
- **`src/modules/example/rules.yaml`** — Business-rule definitions (validation, authorization, state-machine transitions) that the runtime enforces behind the endpoints declared here; the OpenAPI contract describes *what* the API exposes, while `rules.yaml` governs *when* a transition is legal.

## Notes

- The tag description explicitly states this module is "Safe to delete" — it exists as a copy-paste scaffold, not a production domain.
- `GET /examples/{id}` returns **404, never 403**, for non-visible examples (drafts of others, archived non-owners) so the ID leaks no ownership information.
- The `x-cache: private-no-cache` extension on read endpoints signals the bundler/proxy layer to set `Cache-Control: private, no-cache` because responses vary by caller identity and language.
- `x-versioned: [get, put, patch, delete]` on the resource path is a bundler directive: it auto-injects `If-Match` parameters and 412 responses into those operations, and `ETag` into 200 responses — these are not written out per-operation in the spec.
- Status transitions (publish / archive / unarchive) are **not** part of PUT or PATCH; they live on dedicated sub-paths (`/examples/{id}/publish`, etc., truncated here) and are guarded by the module-level `x-error-codes` for conflict cases.
