---
source: src/modules/example/controllers/get-examples.ts
sha256: cd503da34b3ff2c81c21bd12f0bcad0085e5d7fca54818ee649d0aca12178785
generated_at: 2026-10-14T15:40:45.947275+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/get-examples.ts

## Purpose

Thin HTTP wiring for the examples module's two search endpoints (`GET /examples` and `POST /examples/search`). It decodes and validates the incoming request, delegates to the example service, and returns a shaped response — all via the shared search-controller factory so no manual routing or response-building logic lives here.

## Key elements

- **`searchExamplesQuerySchema`** – `SearchExamplesBody` (from `@api/schemas.zod`) extended with `page`/`pageSize` coerced from strings, because the GET form carries them as query text rather than JSON numbers.
- **`getExamples`** (exported) – The controller built by `createSearchController`. Configured with entity `"examples"`, the query schema above, and a `runSearch` callback that calls `exampleService.search(parsed, callerContextOf(request))`. Serves both `GET /examples` and `POST /examples/search`.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — Factory that `getExamples` is built from; handles route binding, validation, and response shaping.
- **`src/modules/example/services/index.ts`** — Provides `exampleService`; its `.search()` method performs the actual data retrieval and is the only business-logic call in this file.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts the caller's identity/permissions from the raw request and passes them to the service for access-control checks.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema`, the shared string→number coercers used to make GET query params conform to the search body schema.
- **`src/modules/example/routes.ts`** — Mounts `getExamples` onto the module's router (the `GET /examples` and `POST /examples/search` paths).

## Notes

- The file deliberately avoids duplicating the search logic: one `createSearchController` call covers both the GET and POST variants. The only module-specific code is the schema extension (string coercion) and the service call.
- Access model (per the JSDoc): without the `examples.any.read` permission the caller sees only their own examples; with it, the search is unscoped. The enforcement lives downstream in `exampleService.search`, not here.
- See `docs/theory/request-flow.md` for the full request→controller→service→response pipeline this file sits in.
