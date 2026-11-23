---
source: src/modules/returns/controllers/get-returns.ts
source_sha256: eefeed8135f5578d93bef450202bddaf3c540cbf8d5c521e13e7f4d8c2cdcf14
context_sha256: f37d7f41b3c42951ef7272c87280301b122ecfe4e89aac765e7c95eb22699b17
generated_at: 2026-11-22T07:21:32.907547+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/controllers/get-returns.ts

## Purpose
Controller for `GET /returns`, which returns a page of returns. Staff see all returns; other callers see only returns on their own orders. That scoping is decided by the service from the caller's auth context, never from a query parameter.

## Key elements
- `getReturns`: the exported controller, built with `createListController` for the `'returns'` entity. It is newest-first unless `sort` says otherwise.
  - `schema`: `ListReturnsQueryParams` (from `@api/schemas.zod`), with `page` and `pageSize` replaced by the infra `pageSchema` and `pageSizeSchema`, then made fully `.partial()`. The swap keeps an absent `page` or `pageSize` absent.
  - `input: { csvLists: ['sort'] }`: `sort` is split on commas.
  - `runList`: calls `returnService.listReturns(parsed, request.authContext!)`.

## Relationships
- `src/infrastructure/http/schemas.ts`: supplies `pageSchema` and `pageSizeSchema` for the query schema.
- `src/infrastructure/surfaces/create-list-controller.ts`: supplies `createListController`, which this file configures with the entity name, schema, input options and `runList` callback.
- `src/modules/returns/services/index.ts`: supplies `returnService`, whose `listReturns` does the querying and the caller-based scoping.
- `src/modules/returns/routes.ts`: a graph neighbor of this file. The file's content does not show how the route is wired.

## Notes
- `request.authContext!` is a non-null assertion. The comment in the file says the `isAuth` middleware guarantees the context, so the route must be behind that middleware.
- Visibility scoping must not be added here or taken from query parameters. It belongs to the service.
