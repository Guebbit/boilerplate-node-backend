---
source: src/modules/locales/controllers/get-locale-tenants.ts
sha256: 812341943761aa5b0703266e8fc367bb1fd5f152128ffa40b75fbb5e0f266770
generated_at: 2026-09-23T18:48:47.223370+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-tenants.ts

## Purpose

Thin HTTP adapter for the `GET /locales/tenants` endpoint. It resolves the list of tenants for which this deployment holds locale data and returns it as a standard success envelope, delegating all data-access logic to `localeService`.

## Key elements

- **`getLocaleTenants`** (exported) — Express handler for `GET /locales/tenants`. Ignores the request object entirely, calls `localeService.listTenants()`, and wraps the result in `successResponse<LocaleTenants>`.
- **`LocaleTenants`** (imported type) — Shapes the response body as `{ tenants: … }`.

## Relationships

- **`src/modules/locales/routes.ts`** — Registers `getLocaleTenants` as the handler for the `GET /locales/tenants` route.
- **`src/modules/locales/services/index.ts`** — Source of `localeService`; this controller calls `localeService.listTenants()` to obtain the tenant list.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the shared helper that formats the JSON success envelope and sets the status code.
- **`src/types/index.ts`** — Exports the `LocaleTenants` interface used as the generic parameter for the response.

## Notes

- The handler is intentionally stateless: no request params, no auth guard, no per-caller variation. The doc comment marks it "public and cacheable."
- The actual tenant list originates from the environment (see `src/modules/locales/tenants`), accessed indirectly through the service layer so the data source can change without touching this controller.
- The underscore-prefixed `_request` parameter signals that the request is deliberately unused; do not add request-dependent logic here without also updating the cacheability assumption.
