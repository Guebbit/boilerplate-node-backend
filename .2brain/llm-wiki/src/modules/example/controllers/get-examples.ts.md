---
source: src/modules/example/controllers/get-examples.ts
source_sha256: 5ac7778dda1309429497e7fca75128d07cad4a166a11a768dfa0f5779ce57734
context_sha256: ee85ccdf6c16a6f6d3b1c04dbec238f8d9ea8fccad728b31f73ff0f8233004e1
generated_at: 2026-11-22T05:07:20.006094+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/controllers/get-examples.ts

## Purpose
Controller for the example module's search endpoint. It serves both `GET /examples` (query-string form) and `POST /examples/search` (JSON body form) as one search, and does so by configuring the shared search-controller factory rather than hand-writing request handling.

## Key elements
- `searchExamplesQuerySchema` (module-private): the generated `SearchExamplesBody` schema extended so `page` and `pageSize` use `pageSchema` / `pageSizeSchema`. This coerces them from strings, since the GET form carries them as query text.
- `getExamples` (exported): the controller, built with `createSearchController`. It is configured with:
  - `entity: 'examples'`
  - `schema: searchExamplesQuerySchema`
  - `runSearch`: calls `exampleService.search(parsed, callerContextOf(request))`

## Relationships
- `src/infrastructure/surfaces/create-search-controller.ts`: provides the `createSearchController` factory that `getExamples` is built from. It receives the entity name, the schema, and the `runSearch` callback.
- `src/infrastructure/http/schemas.ts`: supplies `pageSchema` and `pageSizeSchema` for the query-form coercion.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which derives the caller context from the request and passes it to the service.
- `src/modules/example/services/index.ts`: supplies `exampleService`, whose `search` method does the actual work.
- `src/modules/example/routes.ts`: the routes file is a graph neighbor of this controller. This file does not show how it is wired there.

## Notes
- The controller is deliberately thin: it only decodes the request, calls the service, and shapes the answer. The factory and the service hold the logic.
- The generated `SearchExamplesBody` schema is imported from `@api/schemas.zod`.
- Per the doc comment, the search returns the caller's own examples, or everyone's when called with `display:Example`.
- The same `getExamples` handler serves both the GET and POST forms. Only the schema's `page` / `pageSize` coercion accounts for the difference between them.
