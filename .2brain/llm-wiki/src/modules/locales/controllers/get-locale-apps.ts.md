---
source: src/modules/locales/controllers/get-locale-apps.ts
sha256: fa4fe7f498398eb733a0618d1eb2ae02875efe31936840333278fd892c8ea4fb
generated_at: 2026-11-08T06:20:51.944993+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-apps.ts

## Purpose
Thin Express controller for the `GET /locales/apps` endpoint. It delegates to `localeService.listApps()` and wraps the result in a standard success envelope, keeping the HTTP layer decoupled from the data source.

## Key elements
- **`getLocaleApps`** (exported function) — Express handler (`_request, response`) that calls `localeService.listApps()` and returns `{ apps: … }` via `successResponse<LocaleApps>`. No authentication, no user data; the response is identical for every caller.

## Relationships
- **`src/modules/locales/routes.ts`** — registers this handler on the `GET /locales/apps` route.
- **`src/modules/locales/services/index.ts`** — provides `localeService.listApps()`, the sole data call made here.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the shared response wrapper used to serialize the reply.
- **`src/types/index.ts`** — supplies the `LocaleApps` type used to shape the response body.

## Notes
- The request parameter is intentionally unused (`_request`); the endpoint is stateless and public.
- The JSDoc notes the response is cacheable and that the app list originates from environment config (see `../apps`), abstracted behind the service so the controller never reads env directly.
