---
source: src/modules/returns/controllers/get-returns.ts
sha256: 26a2441cc324798a0fe2456efd48e5ccf4132a6dc653bf2acf1e714764d7eb3f
generated_at: 2026-10-29T05:36:00.889122+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/get-returns.ts

## Purpose

Handles the `GET /returns` endpoint, returning a paginated list of return records. The visibility scope (all returns for staff, own-order returns for everyone else) is determined exclusively by the service layer from the authenticated caller's context — never from a query parameter.

## Key elements

- **`getReturns`** (exported const) — A list controller built via `createListController`. Accepts `page`, `pageSize`, and `sort` query params; passes the parsed input and the request's `authContext` to `returnService.listReturns`. Returns newest-first by default.

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — Provides the `createListController` factory that wraps validation, pagination, and HTTP response shaping around the thin `runList` callback defined here.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema`, which are grafted onto the API-level `ListReturnsQueryParams` to form the full query-param schema for this route.
- **`src/modules/returns/services/index.ts`** — Exposes `returnService`; this controller delegates all data access and scope logic to `returnService.listReturns`.
- **`src/modules/returns/routes.ts`** — Registers `getReturns` on the `GET /returns` path (and presumably applies the `isAuth` middleware upstream).

## Notes

- `request.authContext` is asserted non-null (`!`) on the assumption that an `isAuth` middleware has already run; if that middleware is bypassed, the controller will crash rather than return 401.
- The `page`/`pageSize` fields come from the infrastructure schema pair (not the API-level zod schema) specifically so that an absent value stays `undefined` rather than defaulting.
- `sort` is a comma-separated list, split by the `csvLists` option passed to `createListController`.
