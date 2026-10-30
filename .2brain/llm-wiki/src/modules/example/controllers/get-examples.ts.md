---
source: src/modules/example/controllers/get-examples.ts
sha256: fa91c9545cd8355a37a37e627cb691011ad88437736717b81e50a76f2d02ab71
generated_at: 2026-10-29T03:51:29.582444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/get-examples.ts

## Purpose

Thin controller for `GET /examples` and `POST /examples/search`. Decodes the incoming request, delegates to `exampleService.search`, and returns a shaped response. Built entirely on the shared `createSearchController` factory so the controller layer contains no business logic.

## Key elements

- **`searchExamplesQuerySchema`** – Extends the generated `SearchExamplesBody` (from `@api/schemas.zod`) with `page` and `pageSize` fields coerced from query-string text to numbers.
- **`getExamples`** *(exported)* – The single search controller, constructed by `createSearchController` with the entity name `'examples'`, the schema above, and a `runSearch` callback that calls `exampleService.search(parsed, callerContextOf(request))`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** – Provides `pageSchema` and `pageSizeSchema`, the Zod string-to-number coercions used to build the query schema.
- **`src/infrastructure/http/request.ts`** – Provides `callerContextOf`, which extracts the authenticated caller's context for the service call.
- **`src/infrastructure/surfaces/create-search-controller.ts`** – Supplies the `createSearchController` factory that handles decoding, calling `runSearch`, and shaping the HTTP response.
- **`src/modules/example/services/index.ts`** – Exports `exampleService`, whose `search` method performs the actual data retrieval.
- **`src/modules/example/routes.ts`** – Consumes the exported `getExamples` to wire the controller onto the module's route table.

## Notes

- The GET form carries `page`/`pageSize` as raw query strings, not JSON numbers, which is why the schema explicitly re-declares those fields with string-coercing Zod types. The POST form uses the plain generated body schema.
- The controller is intentionally "thin wiring" (per the module doc comment); all search logic lives in `exampleService.search`.
- See `docs/theory/request-flow.md` for the broader request-decode-call-shape pipeline this controller follows.
