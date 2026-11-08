---
source: src/modules/returns/controllers/get-returns.ts
sha256: 26a2441cc324798a0fe2456efd48e5ccf4132a6dc653bf2acf1e714764d7eb3f
generated_at: 2026-11-08T07:56:07.078438+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/get-returns.ts

## Purpose

Controller for `GET /returns` that returns a paginated list of returns. Staff callers see every return; all other callers see only returns on their own orders. The scoping decision lives in the service (derived from the caller's auth context), never from a query parameter.

## Key elements

- **`getReturns`** (exported const) — the list-controller built via `createListController`. Accepts `page`, `pageSize`, and `sort` (comma-separated) query params, then delegates to `returnService.listReturns(parsed, request.authContext!)`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — imports `pageSchema` and `pageSizeSchema`, which replace the API-level pagination fields so an absent value stays absent rather than being defaulted.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — provides the `createListController` factory that wires up parsing, CSV splitting, and the standard list-response envelope around `runList`.
- **`src/modules/returns/routes.ts`** — registers `getReturns` as the handler for the `GET /returns` route (guarded by `isAuth`).
- **`src/modules/returns/services/index.ts`** — source of `returnService`; its `listReturns` method performs the actual query and caller-based scoping.

## Notes

- `request.authContext!` is a non-null assertion that relies on the `isAuth` middleware running first; if this controller is ever mounted without that middleware, it will throw at runtime.
- The `sort` param arrives as a comma-separated string and is split into an array by the `csvLists: ['sort']` input option on the controller factory — don't pass an array from the client.
- Pagination fields deliberately use the infra schemas (not the API schemas) so that omitting `page`/`pageSize` leaves them `undefined` in the parsed object rather than filling in defaults.
