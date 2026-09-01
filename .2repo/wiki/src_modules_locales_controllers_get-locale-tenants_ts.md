# src/modules/locales/controllers/get-locale-tenants.ts

## Purpose

A thin Express HTTP adapter that exposes `GET /locales/tenants`. It delegates all logic to `localeService.listTenants()` and wraps the result in a standard success envelope, keeping the controller a pure pass-through between the route and the service layer.

## Key elements

- **`getLocaleTenants`** (exported const) — Express handler for `GET /locales/tenants`. Ignores the request object (unused), calls `localeService.listTenants()`, and returns the array via `successResponse` as `{ tenants: [...] }`. No authentication, no user-specific data.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides the `successResponse` helper that this controller uses to serialize the JSON success payload into the Express `Response`.
- **`src/modules/locales/routes.ts`** — The route file that registers `GET /locales/tenants` and wires it to `getLocaleTenants`.
- **`src/modules/locales/services/index.ts`** — Exports `localeService`; this controller calls its `listTenants()` method to obtain the tenant list (sourced from the deployment's environment).

## Notes

- The `Request` parameter is intentionally unused (prefixed `_`); the endpoint is stateless and identical for every caller.
- The doc comment notes the response is cacheable because it contains no user-specific data.
- The source of the tenant list lives in `../tenants` (environment-based), abstracted behind `localeService` so the controller never depends on the environment directly.
