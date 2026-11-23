---
source: src/modules/payments/controllers/get-payments.ts
source_sha256: 8f3cf19f3c3dccf74687614a99556fce38da9ea0f76d8a4e335d7cceded33eff
context_sha256: 37b707e9690922879ae5bf1a63a26c3b28ef954f7c9842798c337f479e6f5d8b
generated_at: 2026-11-22T06:41:21.828165+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/get-payments.ts

## Purpose
Controller for the staff payments list. A single controller serves both `GET /payments` and `POST /payments/search`. It is built with the shared `createSearchController` factory, so the file only supplies the payments-specific validation schema and the search call.

## Key elements
- `searchPaymentsQuerySchema` (module-private): the generated `SearchPaymentsBody` schema extended with the coercions a query string needs.
  - `page` and `pageSize` use `pageSchema` and `pageSizeSchema`.
  - `amountMin` and `amountMax` are wrapped in `z.preprocess(blankToUndefined, ...)`, so a blank value (`amountMin=`) means no filter. The amounts stay decimal text.
  - `disputed` uses `optionalBooleanSchema`.
- `getPayments` (exported): the controller, created with `createSearchController({ entity: 'payments', schema, runSearch })`. `runSearch` calls `paymentService.listPayments(parsed, request.authContext)`.

## Relationships
- `src/infrastructure/http/schemas.ts`: provides the coercion helpers `blankToUndefined`, `optionalBooleanSchema`, `pageSchema` and `pageSizeSchema`.
- `src/infrastructure/surfaces/create-search-controller.ts`: provides `createSearchController`, which builds the controller from the entity name, schema and `runSearch` callback.
- `src/modules/payments/services/index.ts`: provides `paymentService`, whose `listPayments` does the actual search.
- `src/modules/payments/routes.ts`: a neighbor in the dependency graph. The file's doc comment says `getPayments` handles both the GET and POST spellings, so the route wiring presumably lives there. The file itself doesn't show it.

## Notes
- The base schema is `SearchPaymentsBody` from `@api/schemas.zod` (generated). It is reused for the query string, so the coercions above are the only differences from the POST body shape.
- The service receives the authenticated context from `request.authContext`, which is passed alongside the parsed input.
