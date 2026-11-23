---
source: src/modules/example/openapi.yaml
source_sha256: 11b2e91fc16089223f2686de19486f730d411a02a86bf17c6af52f28988df1de
context_sha256: e9695d64818611eacba756079c6803836dc38a0e46956f4572f34fe991ffe575
generated_at: 2026-11-22T05:10:02.020300+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/openapi.yaml

## Purpose
OpenAPI 3.1 contract for the `example` module, described in the file itself as the small, complete domain to copy when starting a new module (and safe to delete). It declares the module's tag, error codes, account-export section, paths, and (further down) component schemas. Shared pieces come from `shared/contracts/openapi.root.yaml` via `$ref`.

## Key elements
- **`tags`**: a single `Examples` tag (`x-family: Example`) that all operations use.
- **`x-error-codes`**: module-level 409 codes `EXAMPLE_NOT_PUBLISHABLE`, `EXAMPLE_NOT_ARCHIVABLE` and `EXAMPLE_NOT_UNARCHIVABLE`. Each carries `errors[].details` of `{ status }`, and the matching `Example.actions.publish|archive|unarchive` flag says whether the transition is open.
- **`x-personal-data`**: adds an `examples` array of `ExportExample` to the `POST /account/export` response (`AccountExportResponse`). It lists every example the account owns, drafts and archived included, and is empty rather than absent.
- **`/examples`**
  - `GET listExamples`: requires `read:Example`; `x-cache: private-no-cache`. Takes page, page size, `sort` (JSON:API style `-createdAt,title`, form, not exploded), text, and `status` parameters. Returns `ExamplesResponse`. Callers see their own examples by default; `display:Example` sees everyone's.
  - `POST createExample`: requires `create:Example`. Accepts an `Idempotency-Key` header, where the same key replays the first answer. Returns 201 `Example` with a `Location` header. Declares 409 `IDEMPOTENCY_IN_FLIGHT`, 422 `IDEMPOTENCY_KEY_MISMATCH`, and 429. Per the inline comment, `createExampleLimiter` is applied in `routes.ts`.
- **`/examples/search`**: `POST searchExamples` takes a JSON body (`SearchExamplesRequest`) and returns `ExamplesResponse`. It is marked `x-alias-of: listExamples`, the DTO form of the same filters.
- **`/examples/{id}`**
  - `GET getExampleById`: open to anonymous callers (`security: [{}, bearerAuth, cookieAuth]`). A `published` example is public. Owners see their own drafts and archived ones, and `display:Example` sees any. Everything else answers `404`, never `403`. Never shared-cached.
  - `PUT replaceExampleById`: requires `update:Example`; `title` and `body` are required (`ReplaceExampleRequest`). Status changes go through `POST /examples/{id}/publish|archive|unarchive`.
  - `PATCH updateExampleById`: RFC 7396 merge-patch, accepting `application/json` and `application/merge-patch+json` (`UpdateExampleRequest`).
  - `DELETE deleteExampleById`: requires `delete:Example`. It permanently removes the example and its cover image.

## Relationships
- `src/modules/example/rules.yaml`: the sibling file in the module. The scopes used here (`read|create|update|delete|display:Example`) are authorization concepts, so it likely holds the matching rules. This is inferred from the graph link, since the visible content doesn't reference it directly.

## Notes
- The `x-*` keys (`x-versioned`, `x-cache`, `x-alias-of`, `x-error-codes`, `x-personal-data`, `x-family`) are project conventions, not standard OpenAPI.
- Per-operation `x-error-codes` map an HTTP status to code names, for example `'409': [IDEMPOTENCY_IN_FLIGHT]`.
- The shared parameters, headers and responses (`PageParam`, `IdPathParam`, `Location`, `Unauthorized`, `ValidationError`, and others) are `$ref`s into `shared/contracts/openapi.root.yaml`.
- The bundler post-processes the file. `x-versioned` adds `ETag` and `Content-Location` to the 2xx answers of `POST /examples`. On `/examples/{id}` it adds `If-Match` and a 412 to get, put, patch and delete, and `ETag` to the 200s. It also merges `x-personal-data` into `AccountExportResponse`.
- 404 is used in place of 403 on single-resource reads to avoid leaking ownership or draft existence.
- Removing the module removes its export section.
