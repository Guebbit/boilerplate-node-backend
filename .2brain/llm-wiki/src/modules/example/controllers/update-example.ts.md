---
source: src/modules/example/controllers/update-example.ts
source_sha256: 14fa4e70fd89466b9cd736dae491429601f50ba61029d7a5f1d2c33d13a539b5
context_sha256: 652a02c3a8801b41dd40ab6558ad167c0a05700f655d7269a673df82cd84b0c2
generated_at: 2026-11-22T05:08:14.691666+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/controllers/update-example.ts

## Purpose
Defines the HTTP controllers for `PUT /examples/:id` (replace) and `PATCH /examples/:id` (merge). Both are built by the shared update factory, which owns the id check, `If-Match` and the `ETag`. This file supplies only the per-module parts: the two body schemas and the service call.

## Key elements
- `replaceTrimmedBody`: the generated `ReplaceExampleByIdBody` schema with `title` and `body` wrapped in `trimmedInto`. A whitespace-only value such as `"   "` fails as a field-level 422 and is not stored as a blank column.
- `updateTrimmedBody`: the generated `UpdateExampleByIdBody` schema with the same trimming, with `title` and `body` made optional. `title` uses `trimmedExampleTitle`, and `body` unwraps the generated optional schema, trims it and re-applies `.optional()`. An omitted field stays omitted.
- `replaceExample` and `updateExample`: the exported handlers, destructured from `createUpdateController(...)` as `replace` and `update`. The factory is configured with:
  - `versioned: true`
  - `entity: 'example'`
  - `notFoundKey: 'example.not-found'`
  - `replaceSchema` and `patchSchema`, set to the two schemas above
  - `update`: calls `exampleService.updateById(id, changes, callerContextOf(request))`
  - `present`: the identity function, because the service already returns the contract's shape

## Relationships
- `src/infrastructure/surfaces/create-update-controller.ts`: provides `createUpdateController`, which builds both handlers and runs the shared pipeline.
- `src/infrastructure/http/schemas.ts`: provides `trimmedInto`, used to trim string fields.
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which turns the request into the caller context passed to the service.
- `src/modules/example/title-rule.ts`: provides `trimmedExampleTitle`, the title rule reused for `PATCH`.
- `src/modules/example/services/index.ts`: provides `exampleService`, whose `updateById` does the actual update.
- `src/modules/example/routes.ts`: this is the neighbor that wires the handlers to the routes.

## Notes
- The `PUT` title is trimmed with the generic `trimmedInto`, while the `PATCH` title uses `trimmedExampleTitle`. Check `title-rule.ts` if the two need to stay consistent.
- The base `ReplaceExampleByIdBody` and `UpdateExampleByIdBody` schemas are imported from the generated `@api/schemas.zod` module.
